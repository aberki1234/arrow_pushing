/** Edited copies of the example reactions written into a test's own temporary folder. */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exampleReactionPath, isRecord } from "./fixtureFiles.js";

/** A new, empty temporary folder. */
export function newTemporaryFolder(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

export function readJsonFile(jsonPath: string): Record<string, unknown> {
  const document: unknown = JSON.parse(readFileSync(jsonPath, "utf-8"));
  if (!isRecord(document)) {
    throw new Error(`${jsonPath} must hold a JSON object`);
  }
  return document;
}

/**
 * Write a copy of the example reaction `exampleSlug` into `<folder>/inputs/` with the given
 * top-level keys replaced; the file is named "<slug>@<version>.json" of the result. Returns its
 * path.
 */
export function copyExampleReaction(
  folder: string,
  exampleSlug: string,
  replacedKeys: Readonly<Record<string, unknown>> = {},
): string {
  const document = { ...readJsonFile(exampleReactionPath(`${exampleSlug}.json`)), ...replacedKeys };
  const inputsFolder = join(folder, "inputs");
  mkdirSync(inputsFolder, { recursive: true });
  const copyPath = join(
    inputsFolder,
    `${String(document.reactionSlug)}@${String(document.reactionVersion)}.json`,
  );
  writeFileSync(copyPath, JSON.stringify(document, null, 2), "utf-8");
  return copyPath;
}

/** Give the reactants state of the reaction file a single hint tier (a lint warning). */
export function leaveOneHintTier(reactionPath: string): void {
  const document = readJsonFile(reactionPath);
  const states = document.stateIdToState;
  const reactants = isRecord(states) ? states.reactants : undefined;
  if (!isRecord(reactants)) {
    throw new Error(`${reactionPath} has no reactants state`);
  }
  reactants.hintTiers = ["One hint."];
  writeFileSync(reactionPath, JSON.stringify(document), "utf-8");
}
