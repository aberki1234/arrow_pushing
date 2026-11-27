/**
 * The draft-sync command line (runFromShell.ts; docs/SPEC.md §6, "Drafting with an assistant"):
 *
 *   check <file|folder>…                  lint reaction files (the full linter) and list findings
 *   push-draft <file|folder>…             push each lint-clean file as a draft (draftSync.ts)
 *   pull-draft [--folder <folder>] <slug>…
 *                                         write the server's newest version of each reaction into
 *                                         the folder (content/reactions by default)
 *
 * A folder stands for its *.json files (not the sync state, .draft-sync.json). push-draft and
 * pull-draft need ARROWPUSH_ACCESS_TOKEN (a token from the server's create-token) and talk to
 * ARROWPUSH_SERVER_URL (https://create.arrowpushing.com by default).
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { SYNC_STATE_FILE_NAME } from "./draftSync.js";

export const DEFAULT_SERVER_URL = "https://create.arrowpushing.com";
const DEFAULT_PULL_FOLDER = "content/reactions";

export type DraftSyncCommand =
  | { readonly commandName: "check" | "push-draft"; readonly paths: string[] }
  | {
      readonly commandName: "pull-draft";
      readonly reactionSlugs: string[];
      readonly folderPath: string;
    };

export class DraftSyncCommandError extends Error {
  override readonly name = "DraftSyncCommandError";
}

export const DRAFT_SYNC_USAGE =
  "usage: runFromShell.ts check <file|folder>… | push-draft <file|folder>… | " +
  "pull-draft [--folder <folder>] <slug>…";

function pullDraftCommand(words: readonly string[]): DraftSyncCommand {
  let folderPath = DEFAULT_PULL_FOLDER;
  let slugWords = words;
  if (words[0] === "--folder") {
    folderPath = words[1] ?? "";
    slugWords = words.slice(2);
  }
  if (folderPath === "" || slugWords.length === 0) {
    throw new DraftSyncCommandError(DRAFT_SYNC_USAGE);
  }
  return { commandName: "pull-draft", reactionSlugs: [...slugWords], folderPath };
}

/** The command in `commandArguments` (process.argv after the script). */
export function parseDraftSyncCommand(commandArguments: readonly string[]): DraftSyncCommand {
  const [commandName, ...remainingWords] = commandArguments;
  if (commandName === "pull-draft") {
    return pullDraftCommand(remainingWords);
  }
  if ((commandName === "check" || commandName === "push-draft") && remainingWords.length > 0) {
    return { commandName, paths: remainingWords };
  }
  throw new DraftSyncCommandError(DRAFT_SYNC_USAGE);
}

/** Each path, a folder replaced by its reaction files in name order. */
export function reactionFilePaths(paths: readonly string[]): string[] {
  return paths.flatMap((path) => {
    const isFolder = statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
    if (!isFolder) {
      return [path];
    }
    return readdirSync(path)
      .filter((fileName) => fileName.endsWith(".json") && fileName !== SYNC_STATE_FILE_NAME)
      .sort()
      .map((fileName) => join(path, fileName));
  });
}

export interface ServerConnection {
  readonly serverUrl: string;
  readonly accessToken: string;
}

/** The server and token from the environment (process.env). */
export function serverConnectionFrom(
  environment: Readonly<Record<string, string | undefined>>,
): ServerConnection {
  const accessToken = (environment.ARROWPUSH_ACCESS_TOKEN ?? "").trim();
  if (accessToken === "") {
    throw new DraftSyncCommandError(
      "set ARROWPUSH_ACCESS_TOKEN to a token from the server's create-token command",
    );
  }
  const serverUrl = (environment.ARROWPUSH_SERVER_URL ?? "").trim() || DEFAULT_SERVER_URL;
  return { serverUrl: serverUrl.replace(/\/+$/, ""), accessToken };
}
