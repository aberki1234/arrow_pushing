/**
 * The editor's mechanism panel as rows (docs/SPEC.md §5, editor decisions 2026-11-25).
 *
 * Order
 *   The preferred route is the main column (depth 0), from the start state. Under each state,
 *   before its route goes on, come the other steps leaving it, each as a branch one level deeper:
 *   the branch's states follow, and it ends in a "join" row where it reaches a state shown
 *   elsewhere.
 *   Within a branch, a state's first leaving step (preferred first, then file order) continues at
 *   the same depth and the others branch again. States no route reaches come last, at depth 0.
 */
import {
  preferredRouteStateIds,
  routeOfDocument,
} from "../../../core/reactionFiles/preferredRoute.js";
import { type ReactionDocument, statesOf, stepsOf } from "../draft/reactionDraft.js";

export type OutlineRow =
  | { readonly rowKind: "state"; readonly depth: number; readonly stateId: string }
  | { readonly rowKind: "join"; readonly depth: number; readonly stateId: string }
  | {
      readonly rowKind: "step";
      readonly depth: number;
      readonly stepKey: string;
      readonly toStateId: string;
    };

type JsonRecord = Readonly<Record<string, unknown>>;

interface Outlining {
  readonly steps: readonly JsonRecord[];
  readonly rows: OutlineRow[];
  /** States shown, or to be shown in the main column (the preferred route). */
  readonly claimed: Set<string>;
}

/** The steps leaving a state, preferred first, then in file order. */
function leavingSteps(outlining: Outlining, stateId: string): JsonRecord[] {
  const leaving = outlining.steps.filter((step) => step.fromStateId === stateId);
  return [
    ...leaving.filter((step) => step.routePreference === "preferred"),
    ...leaving.filter((step) => step.routePreference !== "preferred"),
  ];
}

/** Rows for a state, its branches one level deeper, then the step that continues its column. */
function outlineFrom(outlining: Outlining, stateId: string, depth: number): void {
  outlining.rows.push({ rowKind: "state", depth, stateId });
  const [continuing, ...branches] = leavingSteps(outlining, stateId);
  for (const branch of branches) {
    outlineStep(outlining, branch, depth + 1);
  }
  if (continuing !== undefined) {
    outlineStep(outlining, continuing, depth);
  }
}

function outlineStep(outlining: Outlining, step: JsonRecord, depth: number): void {
  const toStateId = String(step.toStateId);
  outlining.rows.push({ rowKind: "step", depth, stepKey: String(step.stepKey), toStateId });
  // A branch joins a state already shown, or one the main column shows later; the main column
  // itself goes on to its next state.
  const shownLaterInMainColumn = depth > 0 && outlining.claimed.has(toStateId);
  if (shown(outlining, toStateId) || shownLaterInMainColumn) {
    outlining.rows.push({ rowKind: "join", depth, stateId: toStateId });
    return;
  }
  outlining.claimed.add(toStateId);
  outlineFrom(outlining, toStateId, depth);
}

function shown(outlining: Outlining, stateId: string): boolean {
  return outlining.rows.some((row) => row.rowKind === "state" && row.stateId === stateId);
}

export function mechanismOutline(document: ReactionDocument): OutlineRow[] {
  const startStateId = String(document.startStateId);
  const outlining: Outlining = { steps: stepsOf(document), rows: [], claimed: new Set() };
  for (const stateId of preferredRouteStateIds(routeOfDocument(document))) {
    outlining.claimed.add(stateId);
  }
  outlineFrom(outlining, startStateId, 0);
  for (const stateId of Object.keys(statesOf(document))) {
    if (!shown(outlining, stateId)) {
      outlining.rows.push({ rowKind: "state", depth: 0, stateId });
    }
  }
  return outlining.rows;
}
