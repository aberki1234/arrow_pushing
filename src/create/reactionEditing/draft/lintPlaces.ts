/**
 * Where a lint finding sends the author in the editor: the reaction's fields, a state, or a step,
 * with the field named by the finding's JSON pointer (docs/schema-design.md §3.5) when it has one.
 * Findings about all states at once ("/stateIdToState") that name a state in their message
 * ("state betaine: …", the state atom checks) go to that state's structure.
 */
import { type ReactionDocument, stepsOf } from "./reactionDraft.js";

export type LintPlace =
  | { readonly placeKind: "reaction"; readonly field: string | null }
  | { readonly placeKind: "state"; readonly stateId: string; readonly field: string | null }
  | { readonly placeKind: "step"; readonly stepKey: string; readonly field: string | null };

const STATE_NAMED_IN_MESSAGE = /^state (\S+):/;

/** "/a~1b/0" -> ["a/b", "0"] (RFC 6901). */
function pointerParts(instancePath: string): string[] {
  return instancePath === ""
    ? []
    : instancePath
        .slice(1)
        .split("/")
        .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
}

/** A finding about all states: the state its message names, else the reaction. */
function placeOfAllStatesFinding(message: string): LintPlace {
  const namedState = STATE_NAMED_IN_MESSAGE.exec(message)?.[1];
  return namedState === undefined
    ? { placeKind: "reaction", field: "stateIdToState" }
    : { placeKind: "state", stateId: namedState, field: "mappedSmiles" };
}

export function placeOfFinding(
  document: ReactionDocument,
  finding: { readonly instancePath: string; readonly message: string },
): LintPlace {
  const [first, second, third] = pointerParts(finding.instancePath);
  if (first === "stateIdToState" && second !== undefined) {
    return { placeKind: "state", stateId: second, field: third ?? null };
  }
  if (first === "stateIdToState") {
    return placeOfAllStatesFinding(finding.message);
  }
  if (first === "steps" && second !== undefined) {
    const stepKey = stepsOf(document)[Number(second)]?.stepKey;
    if (typeof stepKey === "string") {
      return { placeKind: "step", stepKey, field: third ?? null };
    }
  }
  return { placeKind: "reaction", field: first ?? null };
}
