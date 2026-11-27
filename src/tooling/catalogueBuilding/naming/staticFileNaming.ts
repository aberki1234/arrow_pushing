/**
 * Names and bytes of the static files: reaction version refs, content hashes, file paths.
 *
 * Terms (docs/schema-design.md §0 and §1)
 *   reaction version ref  "<reaction slug>@<reaction version>", e.g. "aldol-addition-base@3".
 *   canonical JSON        The document with its keys sorted at every depth, no white space, UTF-8,
 *                         non-ASCII characters written as they are, numbers as JavaScript's
 *                         JSON.stringify writes them (1.0 is "1"). The static reaction file holds
 *                         exactly these bytes.
 *   content hash          The sha256 hex digest (64 characters) of the canonical JSON.
 *   reaction file path    "r/<slug>/<version>.<first 8 characters of the content hash>.json",
 *                         relative to the site root.
 */
import { createHash } from "node:crypto";

const CONTENT_HASH_CHARACTERS_IN_FILE_NAME = 8;
// The slug pattern of docs/schema-design.md §1, then "@" and a version from 1.
const REACTION_VERSION_REF_PATTERN = /^([a-z0-9]+(?:-[a-z0-9]+)*)@([1-9][0-9]*)$/;

/** Code-unit order, so the order never depends on the locale. */
function compareKeys(first: string, second: string): number {
  if (first === second) {
    return 0;
  }
  return first < second ? -1 : 1;
}

/** The same JSON value with every object's keys in sorted order. */
function withSortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withSortedKeys);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([firstKey], [secondKey]) => compareKeys(firstKey, secondKey))
        .map(([key, item]) => [key, withSortedKeys(item)]),
    );
  }
  return value;
}

export function canonicalJsonBytes(document: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(withSortedKeys(document)));
}

/** The sha256 hex digest (64 characters) of the document's canonical JSON. */
export function contentHashOf(document: unknown): string {
  return createHash("sha256").update(canonicalJsonBytes(document)).digest("hex");
}

export function reactionVersionRef(reactionSlug: string, reactionVersion: number): string {
  return `${reactionSlug}@${String(reactionVersion)}`;
}

/** "aldol@3" -> ["aldol", 3]. Throws for text that is not a reaction version ref. */
export function parseReactionVersionRef(versionRef: string): [string, number] {
  const refMatch = REACTION_VERSION_REF_PATTERN.exec(versionRef);
  if (refMatch?.[1] === undefined || refMatch[2] === undefined) {
    throw new Error(`not a reaction version ref (<slug>@<version>): ${JSON.stringify(versionRef)}`);
  }
  return [refMatch[1], Number(refMatch[2])];
}

/** "r/<slug>/<version>.<first 8 characters of the content hash>.json". */
export function reactionFilePath(
  reactionSlug: string,
  reactionVersion: number,
  contentHash: string,
): string {
  const shortHash = contentHash.slice(0, CONTENT_HASH_CHARACTERS_IN_FILE_NAME);
  return `r/${reactionSlug}/${String(reactionVersion)}.${shortHash}.json`;
}
