/**
 * Responsiveness on large reactions (issue #1): picking a source and checking arrows stay quick on
 * the slowest published reactions, copied into fixtures/performance_reactions. They are slow for
 * different reasons (many atoms; thousands of skeleton symmetries; both), so a fix for one kind of
 * molecule does not pass the rest.
 *
 * Each profile plays every arrow step the way the learner screen does: for each canonical arrow,
 * pick its source with the arrows before it drawn (destinationTargets: what the screen works out
 * after a source tap), then check the canonical arrows and every one-arrow change of the last
 * arrow to another place its source offers (assessAttempt: what Check runs, right and wrong).
 * The first check at a state also works out the state's skeleton symmetries (thousands, for
 * woodward-mpv-reduction), once, as on the site: it has its own, larger budget.
 *
 * Budgets are per action, measured in Node; a phone is several times slower. An action that can
 * be repeated counts its fastest of REPEATS runs, so a busy machine (`make test` runs four files
 * at once) does not fail it while a slow algorithm still does; the first check at a state is cold
 * and runs once. Before the fix the worst actions here took 1–14 s (picks) and 2–26 s (checks);
 * after it, under 5 ms and 40 ms (90 ms for a first check), measured alone.
 */
import { describe, expect, test } from "vitest";
import {
  type CurvedArrow,
  formatElectronLocus,
} from "../../core/arrowNotation/curvedArrowNotation.js";
import {
  type AttemptAssessment,
  assessAttempt,
} from "../../core/attemptAssessment/attemptAssessment.js";
import { graphOf } from "../../core/attemptAssessment/preparedReaction.js";
import { reactionScale } from "../../drawing/moleculeDrawing/shared/drawingLayout.js";
import { type StateDrawing, drawState } from "../../drawing/moleculeDrawing/state/stateDrawing.js";
import { performanceReactionDocuments } from "../../testSupport/fixtureFiles.js";
import { type DestinationTarget, destinationTargets } from "./destinationTargets.js";
import { type SessionReaction, type SessionStep, readSessionReaction } from "./sessionReaction.js";

/** The longest a source pick, a check, and the first check at a state may take, in Node. */
const PICK_BUDGET_MILLISECONDS = 50;
const CHECK_BUDGET_MILLISECONDS = 100;
const FIRST_CHECK_BUDGET_MILLISECONDS = 250;
/** Runs of a repeatable action; its fastest counts. */
const REPEATS = 3;

interface TimedAction {
  readonly actionName: string;
  readonly milliseconds: number;
}

/** The first run's result, and the fastest of `runs` runs. */
function timed<Result>(
  actionName: string,
  run: () => Result,
  runs: number = REPEATS,
): [Result, TimedAction] {
  let fastest = Number.POSITIVE_INFINITY;
  let firstResult: { readonly result: Result } | undefined;
  for (let runNumber = 0; runNumber < runs; runNumber++) {
    const startedAt = performance.now();
    const result = run();
    fastest = Math.min(fastest, performance.now() - startedAt);
    firstResult ??= { result };
  }
  if (firstResult === undefined) {
    throw new Error("timed() needs at least one run");
  }
  return [firstResult.result, { actionName, milliseconds: fastest }];
}

function slowest(actions: readonly TimedAction[]): TimedAction {
  return actions.reduce(
    (worst, action) => (action.milliseconds > worst.milliseconds ? action : worst),
    { actionName: "nothing timed", milliseconds: 0 },
  );
}

function drawingAt(reaction: SessionReaction, stateId: string): StateDrawing {
  const start = reaction.stateIdToState.get(reaction.startStateId);
  const state = reaction.stateIdToState.get(stateId);
  if (start === undefined || state === undefined) {
    throw new Error(`${reaction.reactionSlug} has no state ${stateId}`);
  }
  const scale = reactionScale(
    graphOf(reaction.prepared, reaction.startStateId),
    start.displayFields.mapNumberToCoordinates,
  );
  return drawState(graphOf(reaction.prepared, stateId), state.displayFields, scale, {
    spectatorMapNumbers: reaction.spectatorMapNumbers,
    abbreviatedGroups: reaction.abbreviatedGroups,
  });
}

function arrowSteps(reaction: SessionReaction): SessionStep[] {
  return reaction.steps.filter((step) => step.stepKind !== "change");
}

interface PickRecord {
  readonly offeredLoci: readonly string[];
  readonly wantedLocus: string;
  readonly targets: readonly DestinationTarget[];
}

/** Pick each canonical arrow's source with the arrows before it drawn. */
function pickEachSource(
  reaction: SessionReaction,
  step: SessionStep,
  drawing: StateDrawing,
): [PickRecord[], TimedAction[]] {
  const graph = graphOf(reaction.prepared, step.fromStateId);
  const arrowType = step.stepKind === "radical" ? "fishHook" : "pair";
  const records: PickRecord[] = [];
  const actions: TimedAction[] = [];
  step.canonicalArrows.forEach((curvedArrow, position) => {
    const [targets, action] = timed(`${step.stepKey}: pick source ${String(position + 1)}`, () =>
      destinationTargets(drawing, graph, {
        source: curvedArrow.source,
        arrowType,
        drawnArrows: step.canonicalArrows.slice(0, position),
      }),
    );
    records.push({
      offeredLoci: targets.map((target) => formatElectronLocus(target.destination)),
      wantedLocus: formatElectronLocus(curvedArrow.destination),
      targets,
    });
    actions.push(action);
  });
  return [records, actions];
}

/**
 * Check the canonical arrows, then each change of the last arrow to another offered place. The
 * canonical check is the first at the state (cold, run once) unless another step from it was
 * checked before.
 */
function checkCanonicalAndNeighbours(
  reaction: SessionReaction,
  step: SessionStep,
  lastTargets: readonly DestinationTarget[],
  isFirstAtState: boolean,
): [AttemptAssessment, TimedAction[]] {
  const drawnBefore = step.canonicalArrows.slice(0, -1);
  const lastArrow = step.canonicalArrows.at(-1);
  if (lastArrow === undefined) {
    throw new Error(`${step.stepKey} has no canonical arrows`);
  }
  const check = (
    actionName: string,
    learnerArrows: readonly CurvedArrow[],
    runs: number = REPEATS,
  ): [AttemptAssessment, TimedAction] =>
    timed(
      actionName,
      () => assessAttempt(reaction.prepared, step.fromStateId, learnerArrows),
      runs,
    );
  const [canonicalAssessment, canonicalAction] = check(
    `${step.stepKey}: check canonical`,
    step.canonicalArrows,
    isFirstAtState ? 1 : REPEATS,
  );
  const neighbourActions = lastTargets.map(
    (target) =>
      check(`${step.stepKey}: check last arrow to ${target.target.pickTargetId}`, [
        ...drawnBefore,
        { ...lastArrow, destination: target.destination },
      ])[1],
  );
  return [canonicalAssessment, [canonicalAction, ...neighbourActions]];
}

describe.each(performanceReactionDocuments())("responsiveness on %s", (unusedName, document) => {
  const reaction = readSessionReaction(document);

  test("every source pick offers the canonical place, within budget", () => {
    const actions = arrowSteps(reaction).flatMap((step) => {
      const [records, pickActions] = pickEachSource(
        reaction,
        step,
        drawingAt(reaction, step.fromStateId),
      );
      for (const record of records) {
        expect(record.offeredLoci).toContain(record.wantedLocus);
      }
      return pickActions;
    });
    const worst = slowest(actions);
    expect(worst.milliseconds, worst.actionName).toBeLessThan(PICK_BUDGET_MILLISECONDS);
  });

  test("every check is correct for the canonical arrows, within budget", () => {
    const checkedStateIds = new Set<string>();
    const firstChecks: TimedAction[] = [];
    const laterChecks: TimedAction[] = [];
    for (const step of arrowSteps(reaction)) {
      const [records] = pickEachSource(reaction, step, drawingAt(reaction, step.fromStateId));
      const isFirstAtState = !checkedStateIds.has(step.fromStateId);
      checkedStateIds.add(step.fromStateId);
      const [canonicalAssessment, [firstAction, ...otherActions]] = checkCanonicalAndNeighbours(
        reaction,
        step,
        records.at(-1)?.targets ?? [],
        isFirstAtState,
      );
      expect(canonicalAssessment.assessmentKind, step.stepKey).toBe("correct");
      if (firstAction !== undefined) {
        (isFirstAtState ? firstChecks : laterChecks).push(firstAction);
      }
      laterChecks.push(...otherActions);
    }
    const worstFirst = slowest(firstChecks);
    expect(worstFirst.milliseconds, worstFirst.actionName).toBeLessThan(
      FIRST_CHECK_BUDGET_MILLISECONDS,
    );
    const worst = slowest(laterChecks);
    expect(worst.milliseconds, worst.actionName).toBeLessThan(CHECK_BUDGET_MILLISECONDS);
  });
});
