/**
 * Lint rules on the mechanism graph alone (states and steps, no chemistry).
 *
 * Rules (docs/schema-design.md §3.4 and §3.5), all errors
 *   duplicate-step-key                      two steps share a stepKey (progress records use it)
 *   step-state-id-unknown                   a step's fromStateId or toStateId names no state
 *   state-unreachable                       no route from startStateId reaches the state (rule 1)
 *   mechanism-has-cycle                     some steps lead back to a state already passed (rule 2)
 *   not-exactly-one-product-state           the number of states with no steps leaving them is
 *                                           not 1, so some branch does not rejoin (rule 3)
 *   several-preferred-steps-leave-state     more than one preferred step leaves a state (rule 4)
 *   preferred-route-does-not-reach-product  following preferred steps from the start state stops
 *                                           before the product state (rule 4)
 *   change-step-not-alone                   a change step shares its from-state with another step
 *
 * Steps
 *   unknownStateIdFindings() runs first: the other rules assume every state id exists.
 *   mechanismGraphFindings() then checks the rest, in the order listed above.
 */
import type { LintedReaction } from "./lintedReaction.js";
import { type LintFinding, lintError } from "./lintFindings.js";

/** step-state-id-unknown, at "/steps/<position>/fromStateId" or ".../toStateId". */
export function unknownStateIdFindings(reaction: LintedReaction): LintFinding[] {
  return reaction.steps.flatMap((step, position) =>
    (["fromStateId", "toStateId"] as const)
      .filter((key) => !reaction.stateIdToState.has(step[key]))
      .map((key) =>
        lintError(
          "step-state-id-unknown",
          ["steps", position, key],
          `step "${step.stepKey}": no state "${step[key]}"`,
        ),
      ),
  );
}

/** Every state id, with the positions of the steps leaving it (empty for a product state). */
function stateIdToLeavingStepPositions(reaction: LintedReaction): Map<string, number[]> {
  const stateIdToPositions = new Map<string, number[]>(
    [...reaction.stateIdToState.keys()].map((stateId) => [stateId, []]),
  );
  reaction.steps.forEach((step, position) => {
    stateIdToPositions.get(step.fromStateId)?.push(position);
  });
  return stateIdToPositions;
}

function toStateIdAt(reaction: LintedReaction, position: number): string {
  return reaction.steps[position]?.toStateId ?? "";
}

/** At the second and later uses of a step key. */
function duplicateStepKeyFindings(reaction: LintedReaction): LintFinding[] {
  const seenStepKeys = new Set<string>();
  const findings: LintFinding[] = [];
  reaction.steps.forEach((step, position) => {
    if (seenStepKeys.has(step.stepKey)) {
      findings.push(
        lintError(
          "duplicate-step-key",
          ["steps", position, "stepKey"],
          `step key "${step.stepKey}" is used by an earlier step`,
        ),
      );
    }
    seenStepKeys.add(step.stepKey);
  });
  return findings;
}

function unreachableStateFindings(reaction: LintedReaction): LintFinding[] {
  const leavingPositions = stateIdToLeavingStepPositions(reaction);
  const reached = new Set([reaction.startStateId]);
  const stateIdsToVisit = [reaction.startStateId];
  for (
    let stateId = stateIdsToVisit.pop();
    stateId !== undefined;
    stateId = stateIdsToVisit.pop()
  ) {
    for (const position of leavingPositions.get(stateId) ?? []) {
      const toStateId = toStateIdAt(reaction, position);
      if (!reached.has(toStateId)) {
        reached.add(toStateId);
        stateIdsToVisit.push(toStateId);
      }
    }
  }
  return [...reaction.stateIdToState.keys()]
    .filter((stateId) => !reached.has(stateId))
    .map((stateId) =>
      lintError(
        "state-unreachable",
        ["stateIdToState", stateId],
        `state "${stateId}": no route from the start state reaches it`,
      ),
    );
}

/**
 * A state that some steps lead back to, if any (depth-first search; a state still on the search
 * path when it is met again closes a cycle).
 */
function stateOnACycle(reaction: LintedReaction): string | undefined {
  const leavingPositions = stateIdToLeavingStepPositions(reaction);
  const finished = new Set<string>();
  const onPath = new Set<string>();
  const visit = (stateId: string): string | undefined => {
    onPath.add(stateId);
    for (const position of leavingPositions.get(stateId) ?? []) {
      const toStateId = toStateIdAt(reaction, position);
      if (onPath.has(toStateId)) {
        return toStateId;
      }
      const stateOnCycle = finished.has(toStateId) ? undefined : visit(toStateId);
      if (stateOnCycle !== undefined) {
        return stateOnCycle;
      }
    }
    onPath.delete(stateId);
    finished.add(stateId);
    return undefined;
  };
  for (const stateId of reaction.stateIdToState.keys()) {
    const stateOnCycle = finished.has(stateId) ? undefined : visit(stateId);
    if (stateOnCycle !== undefined) {
      return stateOnCycle;
    }
  }
  return undefined;
}

function cycleFindings(reaction: LintedReaction): LintFinding[] {
  const stateOnCycle = stateOnACycle(reaction);
  if (stateOnCycle === undefined) {
    return [];
  }
  return [
    lintError(
      "mechanism-has-cycle",
      ["stateIdToState", stateOnCycle],
      `state "${stateOnCycle}": steps lead back to it; a reversible dead end is a plausible ` +
        "misconception, not a step",
    ),
  ];
}

function productStateIds(reaction: LintedReaction): string[] {
  return [...stateIdToLeavingStepPositions(reaction)]
    .filter(([, positions]) => positions.length === 0)
    .map(([stateId]) => stateId);
}

function productStateFindings(reaction: LintedReaction): LintFinding[] {
  const productIds = productStateIds(reaction);
  if (productIds.length === 1) {
    return [];
  }
  return [
    lintError(
      "not-exactly-one-product-state",
      ["stateIdToState"],
      `${String(productIds.length)} states have no step leaving them ` +
        `(${productIds.join(", ")}); every branch must rejoin at one product state`,
    ),
  ];
}

/** Where following the preferred steps from the start state stops. */
function endOfPreferredRoute(
  reaction: LintedReaction,
  stateIdToPreferredPositions: ReadonlyMap<string, readonly number[]>,
): string {
  let stateId = reaction.startStateId;
  const passed = new Set<string>();
  let position = stateIdToPreferredPositions.get(stateId)?.[0];
  while (position !== undefined && !passed.has(stateId)) {
    passed.add(stateId);
    stateId = toStateIdAt(reaction, position);
    position = stateIdToPreferredPositions.get(stateId)?.[0];
  }
  return stateId;
}

/**
 * Rule 4: at most one preferred step per state, and the preferred route reaches the product.
 * The route is followed only when the first part holds and there is one product.
 */
function preferredStepFindings(reaction: LintedReaction): LintFinding[] {
  const stateIdToPreferredPositions = new Map(
    [...stateIdToLeavingStepPositions(reaction)].map(([stateId, positions]) => [
      stateId,
      positions.filter((position) => reaction.steps[position]?.routePreference === "preferred"),
    ]),
  );
  const findings = [...stateIdToPreferredPositions.values()].flatMap((positions) =>
    positions.slice(1).map((position) => {
      const step = reaction.steps[position];
      return lintError(
        "several-preferred-steps-leave-state",
        ["steps", position, "routePreference"],
        `step "${step?.stepKey ?? ""}": another preferred step already leaves state ` +
          `"${step?.fromStateId ?? ""}"`,
      );
    }),
  );
  const productIds = productStateIds(reaction);
  if (findings.length > 0 || productIds.length !== 1) {
    return findings;
  }
  const routeEnd = endOfPreferredRoute(reaction, stateIdToPreferredPositions);
  if (routeEnd === productIds[0]) {
    return [];
  }
  return [
    lintError(
      "preferred-route-does-not-reach-product",
      ["stateIdToState", routeEnd],
      `state "${routeEnd}": the route of preferred steps from the start state stops here; ` +
        "mark one step leaving it preferred",
    ),
  ];
}

function changeStepFindings(reaction: LintedReaction): LintFinding[] {
  return [...stateIdToLeavingStepPositions(reaction).values()]
    .filter((positions) => positions.length > 1)
    .flatMap((positions) =>
      positions
        .filter((position) => reaction.steps[position]?.stepKind === "change")
        .map((position) => {
          const step = reaction.steps[position];
          return lintError(
            "change-step-not-alone",
            ["steps", position],
            `change step "${step?.stepKey ?? ""}" must be the only step leaving state ` +
              `"${step?.fromStateId ?? ""}"`,
          );
        }),
    );
}

/** Every other rule of this module. Assumes every step's state ids exist. */
export function mechanismGraphFindings(reaction: LintedReaction): LintFinding[] {
  return [
    ...duplicateStepKeyFindings(reaction),
    ...unreachableStateFindings(reaction),
    ...cycleFindings(reaction),
    ...productStateFindings(reaction),
    ...preferredStepFindings(reaction),
    ...changeStepFindings(reaction),
  ];
}
