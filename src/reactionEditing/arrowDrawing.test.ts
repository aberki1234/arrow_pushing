/**
 * Tests for arrowDrawing.ts: the author's taps on a state become curved arrows, with the same
 * picking rules the learner has (stepSession/arrowPicking.ts), on any state of the draft.
 */
import { describe, expect, it } from "vitest";
import { formatCurvedArrow } from "../arrowNotation/curvedArrowNotation.js";
import { exampleReaction } from "../testSupport/reactionEdits.js";
import {
  cancelPick,
  chooseDestination,
  clearArrows,
  setArrowType,
  startArrowDrawing,
  tapPlace,
  undoArrow,
  type ArrowDrawing,
} from "./arrowDrawing.js";

const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");

function printed(drawing: ArrowDrawing): string[] {
  return drawing.drawnArrows.map(formatCurvedArrow);
}

function drawSubstitution(): ArrowDrawing {
  let drawing = startArrowDrawing(sn2, "reactants");
  drawing = tapPlace(drawing, { placeKind: "lonePair", mapNumber: 1 });
  drawing = tapPlace(drawing, { placeKind: "atom", mapNumber: 2 });
  drawing = tapPlace(drawing, { placeKind: "bond", mapNumbers: [2, 3] });
  return tapPlace(drawing, { placeKind: "atom", mapNumber: 3 });
}

describe("arrow drawing", () => {
  it("turns source and destination taps into arrows", () => {
    expect(printed(drawSubstitution())).toEqual(["lp O1 -> σ O1-C2", "σ C2-Br3 -> lp Br3"]);
  });

  it("works on a state no step leaves (where the author draws the next step)", () => {
    let drawing = startArrowDrawing(sn2, "products");
    drawing = tapPlace(drawing, { placeKind: "lonePair", mapNumber: 3 });
    expect(drawing.pendingSource).not.toBeNull();
  });

  it("explains a refused source tap", () => {
    const drawing = tapPlace(startArrowDrawing(sn2, "reactants"), {
      placeKind: "atom",
      mapNumber: 2,
    });
    expect(drawing.pendingSource).toBeNull();
    expect(drawing.pickMessage).toContain("Start from electrons");
  });

  it("asks which atom forms the bond when a bond's electrons could go either way", () => {
    // The enolate's C=C π electrons can bond C9 to either C3 or C5.
    const aldol = exampleReaction("aldol-addition-base.json");
    let drawing = startArrowDrawing(aldol, "enolate-and-aldehyde");
    drawing = tapPlace(drawing, { placeKind: "bond", mapNumbers: [3, 5] });
    drawing = tapPlace(drawing, { placeKind: "atom", mapNumber: 9 });
    expect(drawing.pendingDestinationOptions).toHaveLength(2);
    const chosen = chooseDestination(drawing, 0);
    expect(chosen.drawnArrows).toHaveLength(1);
    expect(chosen.pendingDestinationOptions).toBeNull();
  });
});

describe("arrow drawing controls", () => {
  it("undoes, clears, cancels and switches arrow type", () => {
    const drawn = drawSubstitution();
    expect(printed(undoArrow(drawn))).toEqual(["lp O1 -> σ O1-C2"]);
    expect(clearArrows(drawn).drawnArrows).toEqual([]);
    const picking = tapPlace(drawn, { placeKind: "lonePair", mapNumber: 1 });
    expect(cancelPick(picking).pendingSource).toBeNull();
    const fishHooks = setArrowType(startArrowDrawing(sn2, "reactants"), "fishHook");
    const drawnFishHook = tapPlace(tapPlace(fishHooks, { placeKind: "bond", mapNumbers: [2, 3] }), {
      placeKind: "atom",
      mapNumber: 3,
    });
    expect(printed(drawnFishHook)).toEqual(["σ C2-Br3 ~> rad Br3"]);
  });

  it("starts with fish-hooks on a radical reaction", () => {
    const radical = exampleReaction("radical-bromination-methane.json");
    expect(startArrowDrawing(radical, "reactants").arrowType).toBe("fishHook");
  });
});
