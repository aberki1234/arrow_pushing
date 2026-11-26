/**
 * The server's settings, read from environment variables (set on Render; docs/SPEC.md §5, backend).
 *
 * Variables
 *   DATABASE_URL              Postgres connection string (Supabase's pooler, Session mode, as the
 *                             role arrowpush_server), ending in
 *                             ?sslmode=verify-full&sslrootcert=deploy/supabase-root-ca.crt: Node
 *                             does not trust Supabase's own root CA, so it is named here (the
 *                             file is Supabase Root 2021 CA, as the pooler presents it).
 *   PUBLIC_BASE_URL           The server's own address, "https://create.arrowpushing.com"
 *                             (GitHub and Google send the browser back to
 *                             <PUBLIC_BASE_URL>/api/auth/callback/github or …/google).
 *   BETTER_AUTH_SECRET        At least 32 random characters: Better Auth signs session cookies
 *                             and encrypts stored GitHub tokens with it.
 *   GITHUB_CLIENT_ID          The GitHub OAuth app's client id and secret (OAuth = open
 *   GITHUB_CLIENT_SECRET      authorization, the sign-in protocol).
 *   ALLOWED_GITHUB_USER_IDS   Comma-separated numeric GitHub user ids of the owner: anyone may
 *                             sign in (as a contributor), these GitHub accounts as the owner.
 *                             Ids, not logins: a login can be renamed.
 *   GOOGLE_CLIENT_ID          Optional, together: the Google OAuth app's client id and secret;
 *   GOOGLE_CLIENT_SECRET      without them only GitHub is offered. The id is a web client's,
 *                             "….apps.googleusercontent.com" (a GitHub id here makes Google
 *                             answer "Error 401: invalid_client", so it is refused at start).
 *   DEPLOY_REPOSITORY         Optional, together: "owner/name" of the repository whose deploy
 *   DEPLOY_DISPATCH_TOKEN     workflow Publish starts, and a token allowed to start it.
 *   EDITOR_FILES_FOLDER       Optional: the built editor (default "build/editor").
 *   PORT                      Optional: the port to listen on (default 3000; Render sets it).
 */

/** The minimum length of BETTER_AUTH_SECRET (Better Auth's own advice). */
export const MINIMUM_SECRET_LENGTH = 32;

export interface SignInSettings {
  readonly betterAuthSecret: string;
  readonly githubClientId: string;
  readonly githubClientSecret: string;
  /** GitHub's numeric user ids of the owner, as text. */
  readonly allowedGithubUserIds: readonly string[];
  /** null when Google sign-in is not set up. */
  readonly google: { readonly clientId: string; readonly clientSecret: string } | null;
}

export interface DeploySettings {
  /** "owner/name". */
  readonly repository: string;
  readonly dispatchToken: string;
}

export interface ServerSettings {
  readonly databaseUrl: string;
  /** Without a trailing slash. */
  readonly publicBaseUrl: string;
  readonly signIn: SignInSettings;
  /** null when Publish should not start a deploy (development). */
  readonly deploy: DeploySettings | null;
  readonly editorFilesFolder: string;
  readonly port: number;
}

export class ServerSettingsError extends Error {
  override readonly name = "ServerSettingsError";
}

const REQUIRED_VARIABLES = [
  "DATABASE_URL",
  "PUBLIC_BASE_URL",
  "BETTER_AUTH_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "ALLOWED_GITHUB_USER_IDS",
] as const;

const GOOGLE_CLIENT_ID_ENDING = ".apps.googleusercontent.com";

const DEFAULT_EDITOR_FILES_FOLDER = "build/editor";

const DEFAULT_PORT = 3000;

type Environment = Readonly<Record<string, string | undefined>>;

/** The variable's value without surrounding spaces; "" when it is not set. */
function trimmedValue(environment: Environment, variableName: string): string {
  return (environment[variableName] ?? "").trim();
}

/** The allow-list's ids, or null if any entry is not a whole number (an empty list included). */
function parsedGithubUserIds(allowListText: string): string[] | null {
  const githubUserIds = allowListText.split(",").map((listEntry) => listEntry.trim());
  const everyEntryIsAnId = githubUserIds.every((githubUserId) => /^[0-9]+$/.test(githubUserId));
  return everyEntryIsAnId ? githubUserIds : null;
}

function parsedPort(portText: string): number | null {
  if (portText === "") {
    return DEFAULT_PORT;
  }
  const port = Number(portText);
  const isValidPort = /^[0-9]+$/.test(portText) && port >= 1 && port <= 65535;
  return isValidPort ? port : null;
}

function isHttpAddress(address: string): boolean {
  return /^https?:\/\/[^/]+/.test(address);
}

/** A description of each problem with the variables (none when they can be used). */
function settingsProblems(environment: Environment): string[] {
  const missingVariables = REQUIRED_VARIABLES.filter(
    (variableName) => trimmedValue(environment, variableName) === "",
  );
  const problems: string[] = [];
  if (missingVariables.length > 0) {
    problems.push(`missing: ${missingVariables.join(", ")}`);
  }
  const secret = trimmedValue(environment, "BETTER_AUTH_SECRET");
  if (secret !== "" && secret.length < MINIMUM_SECRET_LENGTH) {
    problems.push(`BETTER_AUTH_SECRET needs at least ${String(MINIMUM_SECRET_LENGTH)} characters`);
  }
  const allowListText = trimmedValue(environment, "ALLOWED_GITHUB_USER_IDS");
  if (allowListText !== "" && parsedGithubUserIds(allowListText) === null) {
    problems.push("ALLOWED_GITHUB_USER_IDS must be comma-separated numeric GitHub user ids");
  }
  const baseAddress = trimmedValue(environment, "PUBLIC_BASE_URL");
  if (baseAddress !== "" && !isHttpAddress(baseAddress)) {
    problems.push("PUBLIC_BASE_URL must start with http:// or https://");
  }
  if (parsedPort(trimmedValue(environment, "PORT")) === null) {
    problems.push("PORT must be a port number");
  }
  problems.push(...pairProblems(environment));
  const googleClientId = trimmedValue(environment, "GOOGLE_CLIENT_ID");
  if (googleClientId !== "" && !googleClientId.endsWith(GOOGLE_CLIENT_ID_ENDING)) {
    problems.push(
      `GOOGLE_CLIENT_ID must end in ${GOOGLE_CLIENT_ID_ENDING} (the Google web client's id, ` +
        "from Google Cloud Console → Credentials)",
    );
  }
  return problems;
}

/** Optional variables that are set together or not at all. */
const VARIABLE_PAIRS = [
  ["DEPLOY_REPOSITORY", "DEPLOY_DISPATCH_TOKEN"],
  ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
] as const;

function pairProblems(environment: Environment): string[] {
  return VARIABLE_PAIRS.filter(
    ([first, second]) =>
      (trimmedValue(environment, first) !== "") !== (trimmedValue(environment, second) !== ""),
  ).map(([first, second]) => `set both ${first} and ${second}, or neither`);
}

/** The settings from `environment` (process.env). Throws ServerSettingsError with the problems. */
export function readServerSettings(environment: Environment): ServerSettings {
  const problems = settingsProblems(environment);
  if (problems.length > 0) {
    throw new ServerSettingsError(`server settings: ${problems.join("; ")}`);
  }
  const repository = trimmedValue(environment, "DEPLOY_REPOSITORY");
  const editorFilesFolder = trimmedValue(environment, "EDITOR_FILES_FOLDER");
  return {
    databaseUrl: trimmedValue(environment, "DATABASE_URL"),
    publicBaseUrl: trimmedValue(environment, "PUBLIC_BASE_URL").replace(/\/+$/, ""),
    signIn: {
      betterAuthSecret: trimmedValue(environment, "BETTER_AUTH_SECRET"),
      githubClientId: trimmedValue(environment, "GITHUB_CLIENT_ID"),
      githubClientSecret: trimmedValue(environment, "GITHUB_CLIENT_SECRET"),
      allowedGithubUserIds:
        parsedGithubUserIds(trimmedValue(environment, "ALLOWED_GITHUB_USER_IDS")) ?? [],
      google:
        trimmedValue(environment, "GOOGLE_CLIENT_ID") === ""
          ? null
          : {
              clientId: trimmedValue(environment, "GOOGLE_CLIENT_ID"),
              clientSecret: trimmedValue(environment, "GOOGLE_CLIENT_SECRET"),
            },
    },
    deploy:
      repository === ""
        ? null
        : { repository, dispatchToken: trimmedValue(environment, "DEPLOY_DISPATCH_TOKEN") },
    editorFilesFolder: editorFilesFolder === "" ? DEFAULT_EDITOR_FILES_FOLDER : editorFilesFolder,
    port: parsedPort(trimmedValue(environment, "PORT")) ?? DEFAULT_PORT,
  };
}
