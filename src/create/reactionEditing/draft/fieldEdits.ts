/**
 * The 8b form fields: edits of the reaction's, a state's and a step's fields, route preference,
 * renaming states and steps, and wedge styles (docs/SPEC.md §5, editor decisions 2026-11-25).
 *
 * Rules
 *   * Text is trimmed. An optional text cleared to "" removes its key (the schema wants it non-
 *     empty when present); a required one is kept as "" so the lint says it is missing.
 *   * Values the schema would refuse outright (a tier of 4, an unknown class, an annotation near an
 *     atom the state lacks) are refused here, with the reason.
 *   * One preferred step per state: making a step preferred makes the other preferred step
 *     leaving its state accepted.
 *   * A state id or step key is renamed everywhere it is named; the new name must be an unused
 *     slug.
 *   * A bond's wedge style is set to the chosen one (applyWedgeStyle: narrow end on the more
 *     substituted atom, a second tap flips it, plain removes it; it replaced the 2026-11-25
 *     five-step cycle). Key "<a>-<b>" has its wide end at b.
 * Every edit returns a new document; the one given is not changed.
 */
import { stateGraphFromMappedSmiles } from "../../../core/stateGraphs/mappedSmilesReading.js";
import {
  type StateGraph,
  bondKey,
  bondKeyMapNumbers,
} from "../../../core/stateGraphs/stateGraph.js";
import { type ReactionDocument, statesOf, stepsOf } from "./reactionDraft.js";

export type FieldEdit =
  | { readonly outcome: "edited"; readonly document: ReactionDocument }
  | { readonly outcome: "refused"; readonly reason: string };

type JsonRecord = Readonly<Record<string, unknown>>;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ROLE_PATTERN = /^[a-z][A-Za-z0-9]*$/;
export const REACTION_CLASSES = [
  "acid-base",
  "substitution",
  "aromatic substitution",
  "addition",
  "elimination",
  "carbonyl",
  "pericyclic",
  "rearrangement",
  "radical",
] as const;
const REQUIRED_REACTION_TEXTS = new Set(["title", "mechanismSummary", "conditionsLabel"]);
const OPTIONAL_REACTION_TEXTS = new Set(["subtitle"]);

const edited = (document: ReactionDocument): FieldEdit => ({ outcome: "edited", document });
const refused = (reason: string): FieldEdit => ({ outcome: "refused", reason });

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWholeNumberList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => Number.isInteger(item) && Number(item) > 0);
}

function textList(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value.map((item) => item.trim()).filter((item) => item !== "")
    : undefined;
}

/** `record` with `key` set to `value`, or removed when `value` is undefined. */
function withKey(record: JsonRecord, key: string, value: unknown): JsonRecord {
  if (value !== undefined) {
    return { ...record, [key]: value };
  }
  return Object.fromEntries(Object.entries(record).filter(([existing]) => existing !== key));
}

function textValue(value: unknown, isRequired: boolean): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" && !isRequired ? undefined : text;
}

type Checked = { readonly value: unknown } | { readonly reason: string };

function checkedClasses(value: unknown): Checked {
  const unknownClasses = (Array.isArray(value) ? value : []).filter(
    (item) => !(REACTION_CLASSES as readonly unknown[]).includes(item),
  );
  return unknownClasses.length > 0 || !Array.isArray(value)
    ? { reason: `not a reaction class: ${unknownClasses.map(String).join(", ")}` }
    : { value: [...new Set(value)] };
}

function checkedAuthors(value: unknown): Checked {
  const named = (Array.isArray(value) ? value.filter(isRecord) : [])
    .map((author) => ({
      name: textValue(author.name, false),
      url: textValue(author.url, false) ?? null,
    }))
    .filter((author) => author.name !== undefined);
  const badUrl = named.find((author) => author.url !== null && !/^https?:\/\//.test(author.url));
  return badUrl === undefined
    ? { value: named }
    : { reason: `a link starts with http:// or https://: ${String(badUrl.url)}` };
}

function checkedRoles(value: unknown): Checked {
  const entries = Object.entries(isRecord(value) ? value : {});
  const bad = entries.find(
    ([role, mapNumbers]) => !ROLE_PATTERN.test(role) || !isWholeNumberList(mapNumbers),
  );
  return bad === undefined
    ? { value: Object.fromEntries(entries) }
    : { reason: `role "${bad[0]}": a name like nucleophile, and map numbers` };
}

/** How each reaction field's value is checked (texts are handled before these). */
const REACTION_FIELD_CHECKERS: Readonly<Record<string, (value: unknown) => Checked>> = {
  reactionClasses: checkedClasses,
  difficultyTier: (value) =>
    Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 3
      ? { value }
      : { reason: "the difficulty tier is 1 to 3" },
  dailyPuzzleEligible: (value) =>
    typeof value === "boolean" ? { value } : { reason: "daily eligibility is yes or no" },
  spectatorMapNumbers: (value) =>
    isWholeNumberList(value)
      ? { value: [...new Set(value)] }
      : { reason: "spectators are map numbers" },
  references: (value) => ({ value: textList(value) ?? [] }),
  authors: checkedAuthors,
  atomRoleToMapNumbers: checkedRoles,
  abbreviatedGroups: (value) =>
    Array.isArray(value)
      ? { value: value.length === 0 ? undefined : value }
      : { reason: "groups are a list" },
};

/** The checked value for a reaction field, or the reason it is refused. */
function reactionFieldValue(key: string, value: unknown): Checked {
  if (REQUIRED_REACTION_TEXTS.has(key) || OPTIONAL_REACTION_TEXTS.has(key)) {
    return { value: textValue(value, REQUIRED_REACTION_TEXTS.has(key)) };
  }
  const checker = REACTION_FIELD_CHECKERS[key];
  return checker === undefined
    ? { reason: `"${key}" is not a field the editor sets` }
    : checker(value);
}

export function setReactionField(
  document: ReactionDocument,
  key: string,
  value: unknown,
): FieldEdit {
  const checked = reactionFieldValue(key, value);
  return "reason" in checked
    ? refused(checked.reason)
    : edited(withKey(document, key, checked.value));
}

function withState(
  document: ReactionDocument,
  stateId: string,
  state: JsonRecord,
): ReactionDocument {
  return { ...document, stateIdToState: { ...statesOf(document), [stateId]: state } };
}

function annotationsValue(
  state: JsonRecord,
  value: unknown,
): { value: unknown } | { reason: string } {
  const annotations = (Array.isArray(value) ? value : []).filter(isRecord);
  const atoms = stateGraphFromMappedSmiles(String(state.mappedSmiles)).mapNumberToAtom;
  const stray = annotations.find((annotation) => !atoms.has(Number(annotation.nearMapNumber)));
  if (stray !== undefined) {
    return { reason: `the state has no atom ${String(stray.nearMapNumber)}` };
  }
  const kept = annotations
    .map((annotation) => ({
      text: textValue(annotation.text, false),
      nearMapNumber: Number(annotation.nearMapNumber),
    }))
    .filter((annotation) => annotation.text !== undefined);
  return { value: kept.length === 0 ? undefined : kept };
}

/** learnerPrompt and caption (text), hintTiers (texts), annotations ({text, nearMapNumber}). */
export function setStateField(
  document: ReactionDocument,
  stateId: string,
  key: string,
  value: unknown,
): FieldEdit {
  const state = statesOf(document)[stateId];
  if (!isRecord(state)) {
    return refused(`no state "${stateId}"`);
  }
  let checked: Checked;
  if (key === "learnerPrompt" || key === "caption") {
    checked = { value: textValue(value, false) };
  } else if (key === "hintTiers") {
    const tiers = textList(value) ?? [];
    checked = { value: tiers.length === 0 ? undefined : tiers };
  } else if (key === "annotations") {
    checked = annotationsValue(state, value);
  } else {
    checked = { reason: `"${key}" is not a state field the editor sets` };
  }
  return "reason" in checked
    ? refused(checked.reason)
    : edited(withState(document, stateId, withKey(state, key, checked.value)));
}

function withSteps(
  document: ReactionDocument,
  change: (step: JsonRecord) => JsonRecord,
): ReactionDocument {
  return { ...document, steps: stepsOf(document).map(change) };
}

/** explanationAfterStep and caption (text). */
export function setStepField(
  document: ReactionDocument,
  stepKey: string,
  key: string,
  value: unknown,
): FieldEdit {
  if (!stepsOf(document).some((step) => step.stepKey === stepKey)) {
    return refused(`no step "${stepKey}"`);
  }
  if (key !== "explanationAfterStep" && key !== "caption") {
    return refused(`"${key}" is not a step field the editor sets`);
  }
  return edited(
    withSteps(document, (step) =>
      step.stepKey === stepKey ? withKey(step, key, textValue(value, false)) : step,
    ),
  );
}

export function setRoutePreference(
  document: ReactionDocument,
  stepKey: string,
  routePreference: "preferred" | "accepted",
): FieldEdit {
  const step = stepsOf(document).find((candidate) => candidate.stepKey === stepKey);
  if (step === undefined) {
    return refused(`no step "${stepKey}"`);
  }
  return edited(
    withSteps(document, (candidate) => {
      if (candidate.stepKey === stepKey) {
        return { ...candidate, routePreference };
      }
      const sameState = candidate.fromStateId === step.fromStateId;
      return routePreference === "preferred" &&
        sameState &&
        candidate.routePreference === "preferred"
        ? { ...candidate, routePreference: "accepted" }
        : candidate;
    }),
  );
}

function nameProblem(newName: string, usedNames: readonly string[]): string | undefined {
  if (!SLUG_PATTERN.test(newName)) {
    return `"${newName}" is not a slug (lower-case letters and digits, words joined by -)`;
  }
  return usedNames.includes(newName) ? `"${newName}" is already used` : undefined;
}

export function renameState(document: ReactionDocument, oldId: string, newId: string): FieldEdit {
  const states = statesOf(document);
  if (!(oldId in states)) {
    return refused(`no state "${oldId}"`);
  }
  const problem = nameProblem(newId, Object.keys(states));
  if (problem !== undefined) {
    return refused(problem);
  }
  const renamed = (stateId: unknown): unknown => (stateId === oldId ? newId : stateId);
  const stateIdToState: Record<string, unknown> = {};
  for (const [stateId, state] of Object.entries(states)) {
    stateIdToState[stateId === oldId ? newId : stateId] = state;
  }
  return edited({
    ...withSteps(document, (step) => ({
      ...step,
      fromStateId: renamed(step.fromStateId),
      toStateId: renamed(step.toStateId),
    })),
    startStateId: renamed(document.startStateId),
    stateIdToState,
  });
}

export function renameStep(document: ReactionDocument, oldKey: string, newKey: string): FieldEdit {
  const keys = stepsOf(document).map((step) => String(step.stepKey));
  if (!keys.includes(oldKey)) {
    return refused(`no step "${oldKey}"`);
  }
  const problem = nameProblem(newKey, keys);
  return problem !== undefined
    ? refused(problem)
    : edited(
        withSteps(document, (step) =>
          step.stepKey === oldKey ? { ...step, stepKey: newKey } : step,
        ),
      );
}

export type WedgeStyleChoice = "wedge" | "dash" | "plain";

/** Heavy (non-hydrogen) neighbours of an atom: the more, the likelier it is the stereocentre. */
function heavyNeighbourCount(graph: StateGraph, mapNumber: number): number {
  return [...graph.bondToOrder.keys()]
    .map(bondKeyMapNumbers)
    .filter((pair) => pair.includes(mapNumber))
    .map(([first, second]) => (first === mapNumber ? second : first))
    .filter((neighbour) => graph.mapNumberToAtom.get(neighbour)?.element !== "H").length;
}

/**
 * Give a bond the chosen wedge style (docs/SPEC.md §5, editor; 2026-11-26): the narrow end goes on
 * the more substituted atom (the stereocentre); a bond that already has that style flips its
 * narrow end; "plain" removes the style. Keys are "<narrow atom>-<wide atom>".
 */
export function applyWedgeStyle(
  document: ReactionDocument,
  stateId: string,
  [first, second]: readonly [number, number],
  style: WedgeStyleChoice,
): FieldEdit {
  const state = statesOf(document)[stateId];
  if (!isRecord(state)) {
    return refused(`no state "${stateId}"`);
  }
  const graph = stateGraphFromMappedSmiles(String(state.mappedSmiles));
  if (!graph.bondToOrder.has(bondKey(first, second))) {
    return refused(`atoms ${String(first)} and ${String(second)} share no bond`);
  }
  const forward = `${String(first)}-${String(second)}`;
  const backward = `${String(second)}-${String(first)}`;
  const styles = isRecord(state.bondToWedgeStyle) ? state.bondToWedgeStyle : {};
  const currentKey = forward in styles ? forward : backward in styles ? backward : null;
  const others = Object.fromEntries(
    Object.entries(styles).filter(([key]) => key !== forward && key !== backward),
  );
  let added: Record<string, string> = {};
  if (style !== "plain") {
    const narrowFirst = heavyNeighbourCount(graph, first) >= heavyNeighbourCount(graph, second);
    const stereocentreKey = narrowFirst ? forward : backward;
    const isSameStyle = currentKey !== null && styles[currentKey] === style;
    const flippedKey = currentKey === forward ? backward : forward;
    added = { [isSameStyle ? flippedKey : stereocentreKey]: style };
  }
  const bondToWedgeStyle = { ...others, ...added };
  return edited(
    withState(
      document,
      stateId,
      withKey(
        state,
        "bondToWedgeStyle",
        Object.keys(bondToWedgeStyle).length === 0 ? undefined : bondToWedgeStyle,
      ),
    ),
  );
}
