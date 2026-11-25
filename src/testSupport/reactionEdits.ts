/**
 * The edit cases of fixtures/lint_cases/reaction_edits.json: each names an example reaction and
 * a list of edits that make it break lint rules (see that file's description).
 */
import { exampleReactionDocuments, fixtureCaseEntries, isRecord } from "./fixtureFiles.js";

type PathPart = string | number;

export interface ReactionEditCase {
  readonly caseName: string;
  readonly baseReactionFile: string;
  readonly edits: readonly Record<string, unknown>[];
  readonly expectedLintRuleIds: readonly string[];
}

function pathIn(edit: Record<string, unknown>, key: string): PathPart[] | undefined {
  const path = edit[key];
  if (path === undefined) {
    return undefined;
  }
  if (
    !Array.isArray(path) ||
    path.length === 0 ||
    !path.every((part) => typeof part === "string" || typeof part === "number")
  ) {
    throw new Error(`edit field "${key}" must be a non-empty list of keys and positions`);
  }
  return path;
}

function valueAt(document: unknown, path: readonly PathPart[]): unknown {
  let value = document;
  for (const part of path) {
    if (Array.isArray(value) && typeof part === "number") {
      value = value[part];
    } else if (isRecord(value) && typeof part === "string") {
      value = value[part];
    } else {
      throw new Error(`no value at ${JSON.stringify(path)}`);
    }
  }
  return value;
}

function applyEdit(document: Record<string, unknown>, edit: Record<string, unknown>): void {
  const pathToDelete = pathIn(edit, "pathToDelete");
  const path = pathIn(edit, "pathToSet") ?? pathToDelete;
  if (path === undefined) {
    throw new Error("an edit needs pathToSet or pathToDelete");
  }
  const container = valueAt(document, path.slice(0, -1));
  const lastPart = path[path.length - 1];
  const copyFromPath = pathIn(edit, "copyFromPath");
  const newValue: unknown =
    copyFromPath === undefined
      ? structuredClone(edit.newValue)
      : structuredClone(valueAt(document, copyFromPath));
  if (Array.isArray(container) && typeof lastPart === "number") {
    if (pathToDelete !== undefined) {
      container.splice(lastPart, 1);
    } else {
      container[lastPart] = newValue; // one past the end appends
    }
  } else if (isRecord(container) && typeof lastPart === "string") {
    if (pathToDelete !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- edits name any key
      delete container[lastPart];
    } else {
      container[lastPart] = newValue;
    }
  } else {
    throw new Error(`cannot edit at ${JSON.stringify(path)}`);
  }
}

/** A copy of `document` with each edit applied in order. */
export function applyReactionEdits(
  document: Record<string, unknown>,
  edits: readonly Record<string, unknown>[],
): Record<string, unknown> {
  const edited = structuredClone(document);
  for (const edit of edits) {
    applyEdit(edited, edit);
  }
  return edited;
}

export function reactionEditCases(): ReactionEditCase[] {
  return fixtureCaseEntries("lint_cases/reaction_edits.json", "cases").map((entry) => {
    const { caseName, baseReactionFile, edits, expectedLintRuleIds } = entry;
    if (
      typeof caseName !== "string" ||
      typeof baseReactionFile !== "string" ||
      !Array.isArray(edits) ||
      !edits.every(isRecord) ||
      !Array.isArray(expectedLintRuleIds) ||
      !expectedLintRuleIds.every((ruleId) => typeof ruleId === "string")
    ) {
      throw new Error(`malformed lint case ${JSON.stringify(caseName)}`);
    }
    return { caseName, baseReactionFile, edits, expectedLintRuleIds };
  });
}

export function exampleReaction(fileName: string): Record<string, unknown> {
  const found = exampleReactionDocuments().find(([name]) => name === fileName);
  if (found === undefined) {
    throw new Error(`no example reaction ${fileName}`);
  }
  return structuredClone(found[1]);
}

export function editedReaction(caseName: string): Record<string, unknown> {
  const editCase = reactionEditCases().find((candidate) => candidate.caseName === caseName);
  if (editCase === undefined) {
    throw new Error(`no lint case "${caseName}"`);
  }
  return applyReactionEdits(exampleReaction(editCase.baseReactionFile), editCase.edits);
}
