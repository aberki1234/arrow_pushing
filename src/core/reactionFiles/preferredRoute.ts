/**
 * A reaction's preferred route (docs/schema-design.md §3): from the start state, the first step
 * (in file order) whose routePreference is "preferred" out of each state, until none leaves or the
 * next step would return to a state already on the route. Its end is the main product. Lint
 * reports several preferred steps out of one state, and cycles; this walk simply takes the first.
 */
import { isRecord } from "../jsonValues/jsonValues.js";

/** What the walk needs of a step. */
export interface RouteStep {
  readonly fromStateId: string;
  readonly toStateId: string;
  readonly routePreference: string;
}

/** What the walk needs of a mechanism: a typed reaction, or a document read by routeOfDocument. */
export interface RouteOfMechanism<Step extends RouteStep> {
  readonly startStateId: string;
  readonly steps: readonly Step[];
}

/** The preferred route's steps, in order from the start state. */
export function preferredRoute<Step extends RouteStep>(mechanism: RouteOfMechanism<Step>): Step[] {
  const route: Step[] = [];
  const passed = new Set<string>([mechanism.startStateId]);
  let stateId = mechanism.startStateId;
  for (;;) {
    const preferred = mechanism.steps.find(
      (step) => step.fromStateId === stateId && step.routePreference === "preferred",
    );
    if (preferred === undefined || passed.has(preferred.toStateId)) {
      return route;
    }
    route.push(preferred);
    passed.add(preferred.toStateId);
    stateId = preferred.toStateId;
  }
}

/** The state where the preferred route ends: the main product. */
export function endOfPreferredRoute(mechanism: RouteOfMechanism<RouteStep>): string {
  return preferredRoute(mechanism).at(-1)?.toStateId ?? mechanism.startStateId;
}

/** The start state and every state on the preferred route, in order. */
export function preferredRouteStateIds(mechanism: RouteOfMechanism<RouteStep>): string[] {
  return [mechanism.startStateId, ...preferredRoute(mechanism).map((step) => step.toStateId)];
}

/** A reaction document (perhaps an unfinished draft) read for its route, each field as text. */
export function routeOfDocument(
  document: Readonly<Record<string, unknown>>,
): RouteOfMechanism<RouteStep & { readonly step: Readonly<Record<string, unknown>> }> {
  const steps = Array.isArray(document["steps"]) ? (document["steps"] as unknown[]) : [];
  return {
    startStateId: String(document["startStateId"]),
    steps: steps.filter(isRecord).map((step) => ({
      fromStateId: String(step["fromStateId"]),
      toStateId: String(step["toStateId"]),
      routePreference: String(step["routePreference"]),
      step,
    })),
  };
}
