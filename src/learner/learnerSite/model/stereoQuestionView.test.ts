/**
 * Tests for stereoQuestionView.ts on the SN2 example's stereo question. Reference: the drawing
 * reader (drawnTetrahedralMark, checked against RDKit): the wedge a tap draws must show the mark
 * the tap set.
 */
import { describe, expect, it } from "vitest";
import { drawnTetrahedralMark } from "../../../drawing/moleculeDrawing/shared/stereoDrawing.js";
import { exampleSessionReaction } from "../../../testSupport/exampleSessions.js";
import type { TappedPlace } from "../../stepSession/arrowPicking.js";
import {
  type StepSession,
  checkArrows,
  startStepSession,
  tapPlace,
} from "../../stepSession/stepSession.js";
import { stereoQuestionDrawing, tapQuestionTarget } from "./stereoQuestionView.js";

const lonePair = (mapNumber: number): TappedPlace => ({ placeKind: "lonePair", mapNumber });
const atom = (mapNumber: number): TappedPlace => ({ placeKind: "atom", mapNumber });
const bond = (first: number, second: number): TappedPlace => ({
  placeKind: "bond",
  mapNumbers: [first, second],
});

function questionSession(): StepSession {
  const started = startStepSession(exampleSessionReaction("sn2-2-bromobutane-inversion"));
  return checkArrows([lonePair(1), atom(2), bond(2, 3), atom(3)].reduce(tapPlace, started));
}

describe("the stereo question drawing", () => {
  it("shows one unset target at C2 and no wedge there yet", () => {
    const { drawing, targets } = stereoQuestionDrawing(questionSession(), 40);
    expect(targets.map((target) => [target.targetId, target.isSet])).toEqual([["centre-2", false]]);
    const wedgesAtC2 = drawing.bonds.filter(
      (drawnBond) => drawnBond.mapNumbers.includes(2) && drawnBond.bondLines.wedge !== null,
    );
    expect(wedgesAtC2).toEqual([]);
  });

  it("the first tap draws the style the screen chose at random, so it gives nothing away", () => {
    for (const wedgeStyle of ["wedge", "dash"] as const) {
      const once = tapQuestionTarget(questionSession(), "centre-2", {
        relation: "trans",
        wedgeStyle,
      });
      expect(Object.values(stereoQuestionDrawing(once, 40).wedges)).toEqual([wedgeStyle]);
    }
  });

  it("a tap draws a wedge, the next a dash, and each shows the mark it set", () => {
    const firstTap = { relation: "trans", wedgeStyle: "wedge" } as const;
    const once = tapQuestionTarget(questionSession(), "centre-2", firstTap);
    const twice = tapQuestionTarget(once, "centre-2", firstTap);
    for (const [session, style] of [
      [once, "wedge"],
      [twice, "dash"],
    ] as const) {
      const { targets } = stereoQuestionDrawing(session, 40);
      expect(targets[0]?.isSet).toBe(true);
      const { coordinates, wedges } = stereoQuestionDrawing(session, 40);
      expect(Object.values(wedges)).toEqual([style]);
      const graph = session.reaction.prepared.stateIdToGraph.get("products");
      if (graph === undefined) {
        throw new Error("no products");
      }
      expect(drawnTetrahedralMark(graph, 2, coordinates, wedges)).toBe(
        session.questionMarks.get(2),
      );
    }
    expect(once.questionMarks.get(2)).not.toBe(twice.questionMarks.get(2));
  });
});
