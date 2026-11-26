/**
 * Draft sync (docs/SPEC.md §6, "Drafting with an assistant"; build item 10c): an assistant's
 * local reaction files become drafts on the server, owned by the access token's user, and drafts
 * edited in Create come back as files.
 *
 * Terms
 *   draft content hash  contentHashOf the stored draft's document (reactionDatabase/
 *                       draftChangeCheck.ts). The hash of the draft each file was last pushed
 *                       as or pulled from is kept in `.draft-sync.json` beside the files
 *                       (reactionSlugToDraftContentHash).
 * Rules
 *   - A file with lint errors is never sent (warnings are fine).
 *   - A push names the draft it expects to replace: none yet (If-None-Match: *) or the remembered
 *     hash (If-Match). The server refuses with draft-changed when the stored draft differs, as
 *     after an edit in Create; pull it, then edit and push again.
 *   - A pull overwrites the local file with the server's newest version of the reaction.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { contentHashOf } from "../catalogueBuilding/staticFileNaming.js";
import type { LintFinding } from "../reactionLinting/lintFindings.js";

export const SYNC_STATE_FILE_NAME = ".draft-sync.json";

export type DraftSyncFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface DraftSyncSettings {
  /** The Create server, e.g. https://create.arrowpushing.com (no trailing slash). */
  readonly serverUrl: string;
  readonly accessToken: string;
  readonly fetchFunction: DraftSyncFetch;
  /** The full linter (reactionLinting/reactionLint.lintReaction with RDKit.js loaded). */
  readonly lintDocument: (reactionDocument: Readonly<Record<string, unknown>>) => LintFinding[];
}

/** A refusal from the server: its HTTP status and, for the database's refusals, the code. */
export interface ServerRefusal {
  readonly outcome: "refused";
  readonly httpStatus: number;
  readonly refusalCode: string | null;
  readonly message: string;
}

export type PushOutcome =
  | {
      readonly outcome: "pushed";
      readonly reactionSlug: string;
      readonly reactionVersion: number;
      readonly draftContentHash: string;
    }
  | {
      readonly outcome: "has-lint-errors";
      readonly reactionSlug: string;
      readonly lintFindings: LintFinding[];
    }
  | ServerRefusal;

export type PullOutcome =
  | { readonly outcome: "pulled"; readonly filePath: string; readonly reactionVersion: number }
  | ServerRefusal;

type SyncState = Record<string, string>;

function readJsonObject(filePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(filePath, "utf-8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${filePath} does not hold a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function readSyncState(folderPath: string): SyncState {
  const statePath = join(folderPath, SYNC_STATE_FILE_NAME);
  if (!existsSync(statePath)) {
    return {};
  }
  const recorded = readJsonObject(statePath).reactionSlugToDraftContentHash;
  return typeof recorded === "object" && recorded !== null ? (recorded as SyncState) : {};
}

function rememberDraftHash(folderPath: string, reactionSlug: string, draftHash: string): void {
  const reactionSlugToDraftContentHash = {
    ...readSyncState(folderPath),
    [reactionSlug]: draftHash,
  };
  writeFileSync(
    join(folderPath, SYNC_STATE_FILE_NAME),
    `${JSON.stringify({ reactionSlugToDraftContentHash }, null, 2)}\n`,
    "utf-8",
  );
}

async function refusalFrom(response: Response): Promise<ServerRefusal> {
  const text = await response.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = { error: text };
  }
  return {
    outcome: "refused",
    httpStatus: response.status,
    refusalCode: typeof body.refusalCode === "string" ? body.refusalCode : null,
    message: typeof body.error === "string" ? body.error : response.statusText,
  };
}

function reactionAddress(settings: DraftSyncSettings, reactionSlug: string): string {
  return `${settings.serverUrl}/api/reactions/${encodeURIComponent(reactionSlug)}`;
}

/** Lint the reaction file at `filePath` and, with no errors, save it on the server as a draft. */
export async function pushDraftFile(
  filePath: string,
  settings: DraftSyncSettings,
): Promise<PushOutcome> {
  const reactionDocument = readJsonObject(filePath);
  const slugInFile = reactionDocument.reactionSlug;
  const reactionSlug = typeof slugInFile === "string" ? slugInFile : basename(filePath, ".json");
  const lintFindings = settings.lintDocument(reactionDocument);
  if (lintFindings.some((finding) => finding.lintLevel === "error")) {
    return { outcome: "has-lint-errors", reactionSlug, lintFindings };
  }
  const folderPath = dirname(filePath);
  const expectedHash = readSyncState(folderPath)[reactionSlug];
  const response = await settings.fetchFunction(
    `${reactionAddress(settings, reactionSlug)}/draft`,
    {
      method: "PUT",
      headers: {
        authorization: `Bearer ${settings.accessToken}`,
        "content-type": "application/json",
        ...(expectedHash === undefined ? { "if-none-match": "*" } : { "if-match": expectedHash }),
      },
      body: JSON.stringify(reactionDocument),
    },
  );
  if (!response.ok) {
    return refusalFrom(response);
  }
  const written = (await response.json()) as { reactionVersion: number; draftContentHash: string };
  rememberDraftHash(folderPath, reactionSlug, written.draftContentHash);
  return {
    outcome: "pushed",
    reactionSlug,
    reactionVersion: written.reactionVersion,
    draftContentHash: written.draftContentHash,
  };
}

/** Write the server's newest version of `reactionSlug` to `<folderPath>/<reactionSlug>.json`. */
export async function pullDraftFile(
  reactionSlug: string,
  folderPath: string,
  settings: DraftSyncSettings,
): Promise<PullOutcome> {
  const response = await settings.fetchFunction(reactionAddress(settings, reactionSlug), {
    method: "GET",
    headers: { authorization: `Bearer ${settings.accessToken}` },
  });
  if (!response.ok) {
    return refusalFrom(response);
  }
  const stored = (await response.json()) as {
    reactionVersion: number;
    reactionDocument: Record<string, unknown>;
  };
  const filePath = join(folderPath, `${reactionSlug}.json`);
  writeFileSync(filePath, `${JSON.stringify(stored.reactionDocument, null, 2)}\n`, "utf-8");
  rememberDraftHash(folderPath, reactionSlug, contentHashOf(stored.reactionDocument));
  return { outcome: "pulled", filePath, reactionVersion: stored.reactionVersion };
}
