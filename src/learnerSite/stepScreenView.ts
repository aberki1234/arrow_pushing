/**
 * What the step screen shows, worked out from a step session: the step tiles, the line under the
 * canvas, the feedback panel and the drawing of the current state. Pure, so the Svelte
 * components only render it.
 */
import { graphOf } from "../attemptAssessment/preparedReaction.js";
import { reactionScale } from "../moleculeDrawing/drawingLayout.js";
import { type PickTarget, type StateDrawing, drawState } from "../moleculeDrawing/stateDrawing.js";
import type { TappedPlace } from "../stepSession/arrowPicking.js";
import { type FeedbackText, feedbackForAssessment } from "../stepSession/feedbackText.js";
import {
  type SessionReaction,
  type SessionState,
  preferredArrowStepsFrom,
} from "../stepSession/sessionReaction.js";
import type { StepOutcome, StepSession } from "../stepSession/stepSession.js";

/** done (✓ first try, ~ after a retry or hint, ✕ missed), the current step, or one ahead. */
export type StepTileKind = "firstTry" | "helped" | "missed" | "current" | "ahead";

const OUTCOME_TO_TILE: Readonly<
  Record<StepOutcome, { stepTileKind: StepTileKind; tileText: string; spoken: string }>
> = {
  firstTry: { stepTileKind: "firstTry", tileText: "✓", spoken: "first try" },
  afterRetry: { stepTileKind: "helped", tileText: "~", spoken: "with help" },
  afterHint: { stepTileKind: "helped", tileText: "~", spoken: "with help" },
  missed: { stepTileKind: "missed", tileText: "✕", spoken: "missed" },
};

export interface StepTile {
  readonly stepTileKind: StepTileKind;
  /** ✓, ~ or the step's number. */
  readonly tileText: string;
  readonly accessibleName: string;
}

function stateOf(reaction: SessionReaction, stateId: string): SessionState {
  const state = reaction.stateIdToState.get(stateId);
  if (state === undefined) {
    throw new Error(`the reaction has no state "${stateId}"`);
  }
  return state;
}

/** Pixels per coordinate unit for the whole reaction (from its start state). */
export function drawingScaleOf(reaction: SessionReaction): number {
  const start = stateOf(reaction, reaction.startStateId);
  return reactionScale(
    graphOf(reaction.prepared, reaction.startStateId),
    start.displayFields.mapNumberToCoordinates,
  );
}

export function currentStateDrawing(session: StepSession, scale: number): StateDrawing {
  const { reaction, currentStateId } = session;
  return drawState(
    graphOf(reaction.prepared, currentStateId),
    stateOf(reaction, currentStateId).displayFields,
    scale,
    {
      spectatorMapNumbers: reaction.spectatorMapNumbers,
      abbreviatedGroups: reaction.abbreviatedGroups,
    },
  );
}

/** Arrow steps still ahead after the steps taken (the current one included while drawing). */
function stepsAhead(session: StepSession): number {
  const stepDone = session.phase === "stepCorrect" || session.phase === "stepMissed";
  if (stepDone && session.currentStep !== null) {
    return preferredArrowStepsFrom(session.reaction, session.currentStep.toStateId);
  }
  return preferredArrowStepsFrom(session.reaction, session.currentStateId);
}

/** Tiles for the steps taken, the current one, and those left on the preferred route. */
export function stepTiles(session: StepSession): StepTile[] {
  const doneTiles = session.stepResults.map((stepResult, position): StepTile => {
    const { stepTileKind, tileText, spoken } = OUTCOME_TO_TILE[stepResult.stepOutcome];
    return { stepTileKind, tileText, accessibleName: `Step ${String(position + 1)}: ${spoken}` };
  });
  const ahead = stepsAhead(session);
  const aheadTiles = Array.from({ length: ahead }, (unusedEntry, offset): StepTile => {
    const stepNumber = doneTiles.length + offset + 1;
    const isCurrent = offset === 0 && session.phase === "drawing";
    return {
      stepTileKind: isCurrent ? "current" : "ahead",
      tileText: String(stepNumber),
      accessibleName: `Step ${String(stepNumber)}: ${isCurrent ? "current" : "ahead"}`,
    };
  });
  return [...doneTiles, ...aheadTiles];
}

/** "Step 2 of 3": the arrow step being drawn (or just done) and the route's length so far. */
export function stepCounterText(session: StepSession): string {
  const taken = session.stepResults.length;
  const total = taken + stepsAhead(session);
  const current =
    session.phase === "drawing" || session.phase === "changeEvent" ? taken + 1 : taken;
  return `Step ${String(Math.min(current, total))} of ${String(total)}`;
}

/** The instruction under the canvas. */
export function canvasInstruction(session: StepSession): string {
  switch (session.phase) {
    case "stepCorrect":
      return "Correct. Press Next step to continue from the new structure.";
    case "stepMissed":
      return "Out of attempts: the arrows are shown dashed. Press Next step to continue.";
    case "changeEvent":
      return "Nothing to draw here. Press Continue.";
    case "complete":
      return "Mechanism complete.";
    case "drawing":
      if (session.pendingDestinationOptions !== null) {
        return "Which atom forms the new bond? Choose one, or press Esc.";
      }
      return session.pendingSource === null
        ? "Choose a source of electrons: a lone pair, a bond or an unpaired electron."
        : "Now choose where the electrons go: an atom or a bond. Esc cancels.";
  }
}

/** The feedback panel's text for phases that do not depend on a check. */
function phaseFeedback(session: StepSession): FeedbackText | null {
  switch (session.phase) {
    case "changeEvent": {
      const caption = session.currentStep?.caption ?? "";
      return {
        feedbackTone: "neutral",
        heading: "Something changes",
        paragraphs: [caption === "" ? "New molecules join the mixture." : caption],
      };
    }
    case "complete":
      return {
        feedbackTone: "good",
        heading: "Mechanism complete",
        paragraphs: [session.reaction.mechanismSummary],
      };
    case "stepMissed": {
      const explanation = session.currentStep?.explanationAfterStep ?? "";
      return {
        feedbackTone: "wrong",
        heading: "Out of attempts",
        paragraphs: [
          "The arrows for this step are shown dashed.",
          ...(explanation === "" ? [] : [explanation]),
        ],
      };
    }
    default:
      return null;
  }
}

/** The feedback panel: a refused tap, a change event, the end, or the last check. */
export function feedbackPanelText(session: StepSession): FeedbackText {
  if (session.pickMessage !== null) {
    return { feedbackTone: "neutral", heading: "Hold on", paragraphs: [session.pickMessage] };
  }
  const forPhase = phaseFeedback(session);
  if (forPhase !== null) {
    return forPhase;
  }
  if (session.lastAssessment !== null) {
    const explanation =
      session.phase === "stepCorrect" ? (session.currentStep?.explanationAfterStep ?? "") : "";
    return feedbackForAssessment(session.lastAssessment, explanation);
  }
  return {
    feedbackTone: "neutral",
    heading: "Ready",
    paragraphs: ["Draw the arrows, then press Check."],
  };
}

/** What a tap on a pick target means to the step session. */
export function tappedPlaceOf(target: PickTarget): TappedPlace {
  const [first = 0, second = 0] = target.mapNumbers;
  return target.targetKind === "bond"
    ? { placeKind: "bond", mapNumbers: [first, second] }
    : { placeKind: target.targetKind, mapNumber: first };
}

/** One option of the menu: the atom that would form the new bond, named by its badge. */
export interface DestinationChoiceOption {
  /** Drawn on the atom while the menu is open: learners see no map numbers. */
  readonly badge: string;
  readonly formerMapNumber: number;
  readonly label: string;
  /** With the atom's label, as the pick targets name atoms for screen readers. */
  readonly accessibleName: string;
}

export interface DestinationChoice {
  /** The tapped atom, shared by both options: the menu opens beside it. */
  readonly anchorMapNumber: number;
  readonly options: readonly DestinationChoiceOption[];
}

const CHOICE_BADGES = ["①", "②", "③", "④"];

/** The "which atom forms the bond?" menu while a choice is pending; otherwise null. */
export function destinationChoice(
  session: Pick<StepSession, "pendingDestinationOptions">,
): DestinationChoice | null {
  const pending = session.pendingDestinationOptions;
  if (pending === null) {
    return null;
  }
  const atomLists = pending.map((option) => option.atoms.map((atom) => atom.mapNumber));
  const anchorMapNumber =
    atomLists[0]?.find((mapNumber) => atomLists.every((atoms) => atoms.includes(mapNumber))) ?? 0;
  const options = pending.map((option, optionIndex) => {
    const former = option.atoms.find((atom) => atom.mapNumber !== anchorMapNumber);
    const badge = CHOICE_BADGES[optionIndex] ?? String(optionIndex + 1);
    const atomLabel = `${former?.element ?? ""}${String(former?.mapNumber ?? "")}`;
    const isShiftChoice = pending.some((other) => other.locusKind !== option.locusKind);
    let action = "forms the bond";
    if (isShiftChoice) {
      action = option.locusKind === "piBond" ? "forms a π bond" : "shifts across";
    }
    return {
      badge,
      formerMapNumber: former?.mapNumber ?? 0,
      label: `${badge} ${action}`,
      accessibleName: `${badge} (${atomLabel}) ${action}`,
    };
  });
  return { anchorMapNumber, options };
}
