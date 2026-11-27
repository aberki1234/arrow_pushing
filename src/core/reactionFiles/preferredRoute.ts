/**
 * Where a reaction's preferred route ends: follow the preferred step out of each state from the
 * start state until no preferred step leaves (docs/schema-design.md §3, the main product). Read
 * from the reaction file itself, so the catalogue build can find the product a track's showcase
 * draws.
 */

/** A reaction file (or any record with its startStateId and steps). */
export type RouteOfReaction = Readonly<Record<string, unknown>>;

interface RouteStep {
  readonly fromStateId: string;
  readonly toStateId: string;
  readonly routePreference: string;
}

function routeStepsOf(steps: unknown): RouteStep[] {
  if (!Array.isArray(steps)) {
    return [];
  }
  return steps.map((step: unknown) => {
    const record =
      typeof step === "object" && step !== null ? (step as Record<string, unknown>) : {};
    return {
      fromStateId: String(record["fromStateId"]),
      toStateId: String(record["toStateId"]),
      routePreference: String(record["routePreference"]),
    };
  });
}

/** The state id where following the preferred steps from the start state stops. */
export function endOfPreferredRoute(reaction: RouteOfReaction): string {
  const steps = routeStepsOf(reaction["steps"]);
  const passed = new Set<string>();
  let stateId = String(reaction["startStateId"]);
  for (;;) {
    passed.add(stateId);
    const preferred = steps.find(
      (step) => step.fromStateId === stateId && step.routePreference === "preferred",
    );
    if (preferred === undefined || passed.has(preferred.toStateId)) {
      return stateId;
    }
    stateId = preferred.toStateId;
  }
}
