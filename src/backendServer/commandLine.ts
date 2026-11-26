/**
 * The server's command line (runFromShell.ts; `make server`):
 *
 *   serve                                   apply migrations, then listen on PORT
 *   migrate                                 apply migrations only
 *   import [--published <file>…] [--drafts <file>…]
 *                                           import reaction files (contentImport.ts) as the owner:
 *                                           the first ALLOWED_GITHUB_USER_IDS account, who must
 *                                           have signed in once
 *   create-token --user <email> [--name <name>] [--days <n>]
 *                                           mint a personal access token (accessTokens.ts; name
 *                                           "drafting", 90 days by default) and print it once
 *   revoke-token <token id>                 end a token for good
 */

export type BackendCommand =
  | { readonly commandName: "serve" }
  | { readonly commandName: "migrate" }
  | {
      readonly commandName: "import";
      readonly publishedFilePaths: string[];
      readonly draftFilePaths: string[];
    }
  | {
      readonly commandName: "create-token";
      readonly userEmail: string;
      readonly tokenName: string;
      readonly lifetimeDays: number;
    }
  | { readonly commandName: "revoke-token"; readonly accessTokenId: string };

export class CommandLineError extends Error {
  override readonly name = "CommandLineError";
}

export const BACKEND_USAGE =
  "usage: runFromShell.ts serve | migrate | import [--published <file>…] [--drafts <file>…]\n" +
  "       | create-token --user <email> [--name <name>] [--days <n>] | revoke-token <token id>";

const DEFAULT_TOKEN_NAME = "drafting";
const DEFAULT_TOKEN_LIFETIME_DAYS = 90;

/** The file lists of `import`: the words after each of its two options. */
function importFileLists(optionsAndFiles: readonly string[]): BackendCommand {
  const optionToFilePaths: Record<string, string[]> = { "--published": [], "--drafts": [] };
  let currentFilePaths: string[] | undefined;
  for (const word of optionsAndFiles) {
    if (word in optionToFilePaths) {
      currentFilePaths = optionToFilePaths[word];
    } else if (currentFilePaths === undefined || word.startsWith("--")) {
      throw new CommandLineError(`unexpected "${word}"\n${BACKEND_USAGE}`);
    } else {
      currentFilePaths.push(word);
    }
  }
  const publishedFilePaths = optionToFilePaths["--published"] ?? [];
  const draftFilePaths = optionToFilePaths["--drafts"] ?? [];
  if (publishedFilePaths.length + draftFilePaths.length === 0) {
    throw new CommandLineError(`import needs at least one file\n${BACKEND_USAGE}`);
  }
  return { commandName: "import", publishedFilePaths, draftFilePaths };
}

/** The options of `create-token`: each of --user, --name, --days followed by its value. */
function createTokenCommand(optionWords: readonly string[]): BackendCommand {
  const optionToValue = new Map<string, string>();
  for (let position = 0; position < optionWords.length; position += 2) {
    const option = optionWords[position] ?? "";
    const value = optionWords[position + 1];
    if (!["--user", "--name", "--days"].includes(option) || value === undefined) {
      throw new CommandLineError(`unexpected "${option}"\n${BACKEND_USAGE}`);
    }
    optionToValue.set(option, value);
  }
  const userEmail = optionToValue.get("--user");
  const daysText = optionToValue.get("--days") ?? String(DEFAULT_TOKEN_LIFETIME_DAYS);
  if (userEmail === undefined || !/^[0-9]+$/.test(daysText)) {
    throw new CommandLineError(`create-token needs --user and whole --days\n${BACKEND_USAGE}`);
  }
  return {
    commandName: "create-token",
    userEmail,
    tokenName: optionToValue.get("--name") ?? DEFAULT_TOKEN_NAME,
    lifetimeDays: Number(daysText),
  };
}

/** The command in `commandArguments` (process.argv after the script). Throws CommandLineError. */
export function parseBackendCommand(commandArguments: readonly string[]): BackendCommand {
  const [commandName, ...remainingWords] = commandArguments;
  if (commandName === "import") {
    return importFileLists(remainingWords);
  }
  if (commandName === "create-token") {
    return createTokenCommand(remainingWords);
  }
  if (commandName === "revoke-token" && remainingWords.length === 1) {
    return { commandName, accessTokenId: remainingWords[0] ?? "" };
  }
  if ((commandName === "serve" || commandName === "migrate") && remainingWords.length === 0) {
    return { commandName };
  }
  throw new CommandLineError(BACKEND_USAGE);
}
