/**
 * The server's command line (runFromShell.ts; `make server`):
 *
 *   serve                                   apply migrations, then listen on PORT
 *   migrate                                 apply migrations only
 *   import [--published <file>…] [--drafts <file>…]
 *                                           import reaction files (contentImport.ts) as the owner:
 *                                           the first ALLOWED_GITHUB_USER_IDS account, who must
 *                                           have signed in once
 */

export type BackendCommand =
  | { readonly commandName: "serve" }
  | { readonly commandName: "migrate" }
  | {
      readonly commandName: "import";
      readonly publishedFilePaths: string[];
      readonly draftFilePaths: string[];
    };

export class CommandLineError extends Error {
  override readonly name = "CommandLineError";
}

export const BACKEND_USAGE =
  "usage: runFromShell.ts serve | migrate | import [--published <file>…] [--drafts <file>…]";

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

/** The command in `commandArguments` (process.argv after the script). Throws CommandLineError. */
export function parseBackendCommand(commandArguments: readonly string[]): BackendCommand {
  const [commandName, ...remainingWords] = commandArguments;
  if (commandName === "import") {
    return importFileLists(remainingWords);
  }
  if ((commandName === "serve" || commandName === "migrate") && remainingWords.length === 0) {
    return { commandName };
  }
  throw new CommandLineError(BACKEND_USAGE);
}
