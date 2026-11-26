/** Tests for destinationTargets.ts: the places a picked source can go, on example drawings. */
import { describe, expect, test } from "vitest";
import { parseCurvedArrow } from "../arrowNotation/curvedArrowNotation.js";
import { graphOf } from "../attemptAssessment/preparedReaction.js";
import { reactionScale } from "../moleculeDrawing/drawingLayout.js";
import { distanceBetween } from "../moleculeDrawing/planeGeometry.js";
import { type StateDrawing, drawState, drawnAtomOf } from "../moleculeDrawing/stateDrawing.js";
import type { StateGraph } from "../stateGraphs/stateGraph.js";
import { exampleSessionReaction } from "../testSupport/exampleSessions.js";
import {
  type DestinationTarget,
  NEW_BOND_REACH,
  destinationTargets,
  nearestDestinationTarget,
} from "./destinationTargets.js";
import { BOND_LENGTH_PIXELS } from "../moleculeDrawing/drawingLayout.js";
import { newBondDestinations } from "./newBondDestinations.js";

function drawingOf(slug: string, stateId: string): { drawing: StateDrawing; graph: StateGraph } {
  const reaction = exampleSessionReaction(slug);
  const start = reaction.stateIdToState.get(reaction.startStateId);
  const state = reaction.stateIdToState.get(stateId);
  if (start === undefined || state === undefined) {
    throw new Error(`no state ${stateId}`);
  }
  const scale = reactionScale(
    graphOf(reaction.prepared, reaction.startStateId),
    start.displayFields.mapNumberToCoordinates,
  );
  const graph = graphOf(reaction.prepared, stateId);
  return { drawing: drawState(graph, state.displayFields, scale), graph };
}

/** The enolate's C3=C5 π bond picked, beside the second acetaldehyde. */
function enolateTargets(): { drawing: StateDrawing; targets: DestinationTarget[] } {
  const { drawing, graph } = drawingOf("aldol-addition-base", "enolate-and-aldehyde");
  const source = parseCurvedArrow("π C3-C5 -> lp C3").source;
  return {
    drawing,
    targets: destinationTargets(drawing, graph, { source, arrowType: "pair", drawnArrows: [] }),
  };
}

const ids = (targets: readonly DestinationTarget[]): string[] =>
  targets.map((target) => target.target.pickTargetId);

describe("places", () => {
  test("atoms and bonds the picking rules accept, and the near new bonds as dashed lines", () => {
    const { drawing, targets } = enolateTargets();
    expect(ids(targets)).toContain("newBond:3-9");
    expect(ids(targets)).toContain("atom:6");
    // C9 is bonded to neither C3 nor C5: it is reached through a new bond, not tapped.
    expect(ids(targets)).not.toContain("atom:9");
    const newBond = targets.find((target) => target.target.pickTargetId === "newBond:3-9");
    expect(newBond?.target.accessibleName).toBe("new bond C3–C9");
    const c3 = drawnAtomOf(drawing, 3).point;
    const c9 = drawnAtomOf(drawing, 9).point;
    expect(newBond?.target.center).toEqual({ x: (c3.x + c9.x) / 2, y: (c3.y + c9.y) / 2 });
    expect(newBond?.newBondLine).not.toBeNull();
    expect(newBond?.preview.pathData).toMatch(/^M /);
  });

  test("new bonds between atoms drawn far apart are left out", () => {
    const { drawing, graph } = drawingOf("aldol-addition-base", "enolate-and-aldehyde");
    const source = parseCurvedArrow("π C3-C5 -> lp C3").source;
    const shown = new Set(
      ids(destinationTargets(drawing, graph, { source, arrowType: "pair", drawnArrows: [] })),
    );
    for (const destination of newBondDestinations(graph, source, [])) {
      const [first = 0, second = 0] = destination.atoms.map((atom) => atom.mapNumber);
      const drawnLength = distanceBetween(
        drawnAtomOf(drawing, first).point,
        drawnAtomOf(drawing, second).point,
      );
      const isNear = drawnLength <= NEW_BOND_REACH * BOND_LENGTH_PIXELS;
      expect(
        shown.has(`newBond:${String(first)}-${String(second)}`),
        `${String(first)}-${String(second)}`,
      ).toBe(isNear);
    }
  });

  test("a lone pair source has no new bonds: its atom taps say which bond", () => {
    const { drawing, graph } = drawingOf("aldol-addition-base", "enolate-and-aldehyde");
    const source = parseCurvedArrow("lp O6 -> π C5-O6").source;
    const targets = destinationTargets(drawing, graph, {
      source,
      arrowType: "pair",
      drawnArrows: [],
    });
    expect(targets.some((target) => target.target.targetKind === "newBond")).toBe(false);
    expect(ids(targets)).toContain("atom:9");
  });
});

describe("the nearest place", () => {
  test("is measured to centres: an atom's point, a new bond's midpoint", () => {
    const { drawing, targets } = enolateTargets();
    const newBond = targets.find((target) => target.target.pickTargetId === "newBond:3-9");
    if (newBond === undefined) {
      throw new Error("no new bond C3–C9");
    }
    const nearMiddle = { x: newBond.target.center.x + 3, y: newBond.target.center.y - 2 };
    expect(nearestDestinationTarget(targets, nearMiddle)?.target.pickTargetId).toBe("newBond:3-9");
    const c6 = drawnAtomOf(drawing, 6).point;
    expect(nearestDestinationTarget(targets, c6)?.target.pickTargetId).toBe("atom:6");
    expect(nearestDestinationTarget(targets, { x: 10_000, y: 10_000 })).toBeNull();
  });
});
