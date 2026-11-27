/** Example reactions (and test edits of them) read as typed reaction files, for tests. */
import type { ReactionFile, ReactionMechanism } from "../core/reactionFiles/reactionFile.js";
import {
  readReactionFile,
  readReactionMechanism,
} from "../core/reactionFiles/reactionFileReading.js";
import { exampleReactionDocuments } from "./fixtureFiles.js";

/** The document as a reaction file; throws, naming the first violation, if it breaks the schema. */
export function asReactionFile(reactionDocument: unknown): ReactionFile {
  const reading = readReactionFile(reactionDocument);
  if (!("reactionFile" in reading)) {
    const [first] = reading.schemaViolations;
    throw new Error(`not a reaction file: ${first?.instancePath ?? ""} ${first?.message ?? ""}`);
  }
  return reading.reactionFile;
}

/** A hand-built mechanism (no Publish fields), typed; throws if it breaks the schema. */
export function asReactionMechanism(reactionDocument: unknown): ReactionMechanism {
  const reading = readReactionMechanism(reactionDocument);
  if (!("reactionMechanism" in reading)) {
    const [first] = reading.schemaViolations;
    throw new Error(`not a mechanism: ${first?.instancePath ?? ""} ${first?.message ?? ""}`);
  }
  return reading.reactionMechanism;
}

/** An example reaction from fixtures/reactions, e.g. "sn2-hydroxide-bromomethane.json". */
export function exampleReactionFile(fileName: string): ReactionFile {
  const found = exampleReactionDocuments().find(([name]) => name === fileName);
  if (found === undefined) {
    throw new Error(`no example reaction ${fileName}`);
  }
  return asReactionFile(structuredClone(found[1]));
}

/**
 * A valid reaction file named `versionRef` ("aldol@2"): the SN2 example under that slug and
 * version, with `overrides` (top-level fields; undefined removes one) applied, for tests that
 * need many versions.
 */
export function standInReactionFile(
  versionRef: string,
  overrides: Readonly<Record<string, unknown>> = {},
): ReactionFile {
  const [reactionSlug = "", versionText = ""] = versionRef.split("@");
  const reactionVersion = Number(versionText);
  const fields: Record<string, unknown> = {
    ...exampleReactionFile("sn2-hydroxide-bromomethane.json"),
    reactionSlug,
    reactionVersion,
    previousReactionVersion: reactionVersion === 1 ? null : reactionVersion - 1,
    ...overrides,
  };
  // An override of undefined removes the field (e.g. the example's subtitle).
  return asReactionFile(
    Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)),
  );
}
