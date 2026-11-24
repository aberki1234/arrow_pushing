/** Tests for stepScreenView.ts on runs through the example reactions. */
import { describe, expect, test } from "vitest";
import { exampleSessionReaction } from "../testSupport/exampleSessions.js";
import type { TappedPlace } from "../stepSession/arrowPicking.js";
import {
  type StepSession,
  checkArrows,
  continueToNextState,
  showNextHint,
  startStepSession,
  tapPlace,
} from "../stepSession/stepSession.js";
import type { PickTarget, PickTargetKind } from "../moleculeDrawing/stateDrawing.js";
import {
  canvasInstruction,
  destinationChoice,
  tappedPlaceOf,
  currentStateDrawing,
  drawingScaleOf,
  feedbackPanelText,
  stepCounterText,
  stepTiles,
} from "./stepScreenView.js";

const atom = (mapNumber: number): TappedPlace => ({ placeKind: "atom", mapNumber });
const lonePair = (mapNumber: number): TappedPlace => ({ placeKind: "lonePair", mapNumber });
const bond = (first: number, second: number): TappedPlace => ({
  placeKind: "bond",
  mapNumbers: [first, second],
});

function aldolSession(): StepSession {
  return startStepSession(exampleSessionReaction("aldol-addition-base"));
}

/** The aldol's first step (enolate formation), checked. */
function aldolFirstStepChecked(session = aldolSession()): StepSession {
  const taps = [lonePair(1), atom(4), bond(3, 4), atom(5), bond(5, 6), atom(6)];
  return checkArrows(taps.reduce(tapPlace, session));
}

describe("tiles and counter", () => {
  test("at the start: the current tile then the steps ahead", () => {
    const tiles = stepTiles(aldolSession());
    expect(tiles.map((tile) => tile.stepTileKind)).toEqual(["current", "ahead", "ahead"]);
    expect(tiles.map((tile) => tile.tileText)).toEqual(["1", "2", "3"]);
    expect(stepCounterText(aldolSession())).toBe("Step 1 of 3");
  });

  test("a first-try step is ✓; one after a hint is ~", () => {
    const done = continueToNextState(continueToNextState(aldolFirstStepChecked()));
    expect(stepTiles(done).map((tile) => tile.tileText)).toEqual(["✓", "2", "3"]);
    expect(stepTiles(done)[0]?.accessibleName).toBe("Step 1: first try");
    expect(stepCounterText(done)).toBe("Step 2 of 3");
    const helped = aldolFirstStepChecked(showNextHint(aldolSession()));
    expect(stepTiles(helped).map((tile) => tile.stepTileKind)).toEqual([
      "helped",
      "ahead",
      "ahead",
    ]);
    expect(stepCounterText(helped)).toBe("Step 1 of 3");
  });
});

describe("canvas instruction", () => {
  test("choose a source, then a destination", () => {
    expect(canvasInstruction(aldolSession())).toMatch(/source/);
    expect(canvasInstruction(tapPlace(aldolSession(), lonePair(1)))).toMatch(/go/);
  });

  test("after a correct check, and during a change event", () => {
    const checked = aldolFirstStepChecked();
    expect(canvasInstruction(checked)).toMatch(/Next step/);
    expect(canvasInstruction(continueToNextState(checked))).toMatch(/Continue/);
  });
});

describe("feedback panel", () => {
  test("ready, then the result of a check with the step's explanation", () => {
    expect(feedbackPanelText(aldolSession()).heading).toBe("Ready");
    const checked = feedbackPanelText(aldolFirstStepChecked());
    expect(checked.heading).toBe("Correct");
    expect(checked.paragraphs.join(" ")).toMatch(/enolate/i);
  });

  test("a refused tap is explained", () => {
    const refused = feedbackPanelText(tapPlace(aldolSession(), atom(3)));
    expect(refused.feedbackTone).toBe("neutral");
    expect(refused.paragraphs[0]).toMatch(/lone pair/);
  });

  test("a change event shows its caption; the end shows the mechanism summary", () => {
    const event = feedbackPanelText(continueToNextState(aldolFirstStepChecked()));
    expect(event.heading).toBe("Something changes");
    const sn2 = startStepSession(exampleSessionReaction("sn2-hydroxide-bromomethane"));
    const sn2Done = continueToNextState(
      checkArrows([lonePair(1), atom(2), bond(2, 3), atom(3)].reduce(tapPlace, sn2)),
    );
    const complete = feedbackPanelText(sn2Done);
    expect(complete.heading).toBe("Mechanism complete");
    expect(complete.paragraphs[0]).toBe(sn2.reaction.mechanismSummary);
  });
});

test("the drawing uses one scale for the whole reaction", () => {
  const session = aldolSession();
  const scale = drawingScaleOf(session.reaction);
  expect(scale).toBeGreaterThan(0);
  const later = continueToNextState(continueToNextState(aldolFirstStepChecked(session)));
  expect(currentStateDrawing(later, scale).atoms.map((drawn) => drawn.mapNumber)).toContain(9);
});

describe("canvas helpers", () => {
  test("pick targets become tapped places", () => {
    const target = (targetKind: PickTargetKind, mapNumbers: number[]): PickTarget => ({
      pickTargetId: "x",
      targetKind,
      mapNumbers,
      center: { x: 0, y: 0 },
      radius: 1,
      accessibleName: "x",
    });
    expect(tappedPlaceOf(target("lonePair", [1]))).toEqual({ placeKind: "lonePair", mapNumber: 1 });
    expect(tappedPlaceOf(target("atom", [4]))).toEqual({ placeKind: "atom", mapNumber: 4 });
    expect(tappedPlaceOf(target("bond", [2, 3]))).toEqual({
      placeKind: "bond",
      mapNumbers: [2, 3],
    });
  });

  test("the destination choice names the atom that forms the bond, by the tapped atom", () => {
    const waiting = [bond(3, 5), atom(9)].reduce(
      tapPlace,
      continueToNextState(continueToNextState(aldolFirstStepChecked())),
    );
    expect(destinationChoice(waiting)).toEqual({
      anchorMapNumber: 9,
      optionLabels: ["C3 forms the bond", "C5 forms the bond"],
    });
    expect(destinationChoice(aldolSession())).toBeNull();
  });
});
