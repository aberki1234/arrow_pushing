/**
 * Deleting a step: the step goes, and so does every state no route from the start state reaches
 * any more, with the steps leaving those states. The editor asks the author to confirm first,
 * naming the states (statesLeftUnreachable). Route preferences are not changed; the 8b lint
 * shows a preferred route left without its product.
 */
import { type ReactionDocument, statesOf, stepsOf } from "../draft/reactionDraft.js";

export type StepDeletion =
  | {
      readonly outcome: "deleted";
      readonly document: ReactionDocument;
      readonly removedStateIds: readonly string[];
    }
  | { readonly outcome: "refused"; readonly reason: string };

type JsonRecord = Readonly<Record<string, unknown>>;

/** The states reached from the start state by `steps`. */
function reachedStateIds(startStateId: string, steps: readonly JsonRecord[]): Set<string> {
  const reached = new Set([startStateId]);
  const toVisit = [startStateId];
  for (let stateId = toVisit.pop(); stateId !== undefined; stateId = toVisit.pop()) {
    for (const step of steps) {
      const next = String(step.toStateId);
      if (step.fromStateId === stateId && !reached.has(next)) {
        reached.add(next);
        toVisit.push(next);
      }
    }
  }
  return reached;
}

/** Without the step: the steps and states still reached from the start state. */
function withoutStep(
  document: ReactionDocument,
  stepKey: string,
): { steps: JsonRecord[]; removedStateIds: string[] } {
  const remaining = stepsOf(document).filter((step) => step.stepKey !== stepKey);
  const reached = reachedStateIds(String(document.startStateId), remaining);
  return {
    steps: remaining.filter((step) => reached.has(String(step.fromStateId))),
    removedStateIds: Object.keys(statesOf(document)).filter((stateId) => !reached.has(stateId)),
  };
}

/** The states deleting the step would remove, in stateIdToState order. */
export function statesLeftUnreachable(document: ReactionDocument, stepKey: string): string[] {
  return withoutStep(document, stepKey).removedStateIds;
}

export function deleteStep(document: ReactionDocument, stepKey: string): StepDeletion {
  if (!stepsOf(document).some((step) => step.stepKey === stepKey)) {
    return { outcome: "refused", reason: `no step "${stepKey}"` };
  }
  const { steps, removedStateIds } = withoutStep(document, stepKey);
  const stateIdToState = Object.fromEntries(
    Object.entries(statesOf(document)).filter(([stateId]) => !removedStateIds.includes(stateId)),
  );
  return { outcome: "deleted", document: { ...document, stateIdToState, steps }, removedStateIds };
}
