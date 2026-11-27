/**
 * Lint rules on the mechanism graph alone (states and steps, no chemistry).
 *
 * Rules (docs/schema-design.md §3.4 and §3.5), errors except where marked
 *   duplicate-step-key                      two steps share a stepKey (progress records use it)
 *   step-state-id-unknown                   a step's fromStateId or toStateId names no state
 *   state-unreachable                       no route from startStateId reaches the state (rule 1)
 *   mechanism-has-cycle                     some steps lead back to a state already passed (rule 2)
 *   several-preferred-steps-leave-state     more than one preferred step leaves a state (rule 4)
 *   preferred-route-does-not-reach-product  following preferred steps from the start state stops
 *                                           at a state that steps still leave (rule 4)
 *   alternative-product-without-caption     (warning) a product state other than the main product
 *                                           has no caption saying what it is (rule 3)
 *
 * Terms (rule 3, decided 2026-11-26, build item 10e)
 *   product state        a state no step leaves. A reaction may have several.
 *   main product         the product state where the route of preferred steps from the start state
 *                        ends.
 *   alternative product  any other product state, reached only by accepted steps (a minor
 *                        regioisomer, such as ortho beside para).
 *   change-step-not-alone                   a change step shares its from-state with another step
 *
 * Steps
 *   unknownStateIdFindings() runs first: the other rules assume every state id exists.
 *   mechanismGraphFindings() then checks the rest, in the order listed above.
 */
import type { LintedReaction } from "../findings/lintedReaction.js";
import { type LintFinding, lintError, lintWarning } from "../findings/lintFindings.js";

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

function preferredStepPositionsByState(reaction: LintedReaction): Map<string, number[]> {
  return new Map(
    [...stateIdToLeavingStepPositions(reaction)].map(([stateId, positions]) => [
      stateId,
      positions.filter((position) => reaction.steps[position]?.routePreference === "preferred"),
    ]),
  );
}

/** Rule 3: every alternative product says what it is, once the main product is known. */
function alternativeProductFindings(reaction: LintedReaction): LintFinding[] {
  const productIds = productStateIds(reaction);
  const mainProductId = endOfPreferredRoute(reaction, preferredStepPositionsByState(reaction));
  if (!productIds.includes(mainProductId)) {
    return [];
  }
  return productIds
    .filter((stateId) => stateId !== mainProductId)
    .filter((stateId) => reaction.stateIdToState.get(stateId)?.hasCaption !== true)
    .map((stateId) =>
      lintWarning(
        "alternative-product-without-caption",
        ["stateIdToState", stateId],
        `state "${stateId}" is an alternative product (the preferred route ends at ` +
          `"${mainProductId}"): give it a caption saying what it is, e.g. "ortho product (minor)"`,
      ),
    );
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
 * Rule 4: at most one preferred step per state, and the preferred route ends at a product state.
 * The route is followed only when the first part holds.
 */
function preferredStepFindings(reaction: LintedReaction): LintFinding[] {
  const stateIdToPreferredPositions = preferredStepPositionsByState(reaction);
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
  if (findings.length > 0) {
    return findings;
  }
  const routeEnd = endOfPreferredRoute(reaction, stateIdToPreferredPositions);
  if (productStateIds(reaction).includes(routeEnd)) {
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
    ...preferredStepFindings(reaction),
    ...alternativeProductFindings(reaction),
    ...changeStepFindings(reaction),
  ];
}
