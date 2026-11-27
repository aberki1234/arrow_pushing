/** Tests for destinationTargets.ts: the places a picked source can go, on example drawings. */
import { describe, expect, test } from "vitest";
import {
  type CurvedArrow,
  formatCurvedArrow,
  formatElectronLocus,
  parseCurvedArrow,
} from "../../core/arrowNotation/curvedArrowNotation.js";
import { graphOf } from "../../core/attemptAssessment/preparedReaction.js";
import { reactionScale } from "../../drawing/moleculeDrawing/shared/drawingLayout.js";
import {
  type StateDisplayFields,
  type StateDrawing,
  drawState,
  drawnAtomOf,
} from "../../drawing/moleculeDrawing/state/stateDrawing.js";
import type { StateGraph } from "../../core/stateGraphs/stateGraph.js";
import { exampleSessionReaction } from "../../testSupport/exampleSessions.js";
import {
  type DestinationTarget,
  destinationTargets,
  nearestDestinationTarget,
} from "./destinationTargets.js";
import { newBondDestinations } from "./newBondDestinations.js";
import { stateGraphFromMappedSmiles } from "../../core/stateGraphs/mappedSmilesReading.js";

const EXAMPLE_SLUGS = [
  "sn2-hydroxide-bromomethane",
  "aldol-addition-base",
  "wittig-methylenation-cyclohexanone",
  "radical-bromination-methane",
];

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

  test("a new bond to another molecule is offered however far apart they are drawn", () => {
    const { drawing, graph } = drawingOf("aldol-addition-base", "enolate-and-aldehyde");
    const source = parseCurvedArrow("π C3-C5 -> lp C3").source;
    const shown = new Set(
      ids(destinationTargets(drawing, graph, { source, arrowType: "pair", drawnArrows: [] })),
    );
    for (const destination of newBondDestinations(graph, source, [])) {
      const [first, second] = destination.atoms.map((atom) => atom.mapNumber);
      expect(shown.has(`newBond:${String(first)}-${String(second)}`)).toBe(true);
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

  test("pointing at a new bond's far atom picks it; an atom that is a place wins", () => {
    const { drawing, targets } = enolateTargets();
    // C9 is not a place (bonded to neither C3 nor C5), so pointing at it means the new bond to it.
    const c9 = drawnAtomOf(drawing, 9).point;
    expect(nearestDestinationTarget(targets, c9)?.target.pickTargetId).toBe("newBond:3-9");
    const c5 = drawnAtomOf(drawing, 5).point;
    expect(nearestDestinationTarget(targets, c5)?.target.pickTargetId).toBe("atom:5");
  });
});

/** Every ordering of `items`. */
function orderings<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) {
    return [items.slice()];
  }
  return items.flatMap((item, index) =>
    orderings([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]),
  );
}

describe("every authored arrow can be picked, in any order", () => {
  test.each(EXAMPLE_SLUGS)("%s", (slug) => {
    const reaction = exampleSessionReaction(slug);
    for (const step of reaction.steps) {
      const { drawing, graph } = drawingOf(slug, step.fromStateId);
      for (const order of orderings(step.canonicalArrows)) {
        const drawnArrows: CurvedArrow[] = [];
        for (const curvedArrow of order) {
          const places = destinationTargets(drawing, graph, {
            source: curvedArrow.source,
            arrowType: curvedArrow.electronsMoved === 2 ? "pair" : "fishHook",
            drawnArrows,
          });
          expect(
            places.map((place) => formatElectronLocus(place.destination)),
            `${step.stepKey}: ${order.map(formatCurvedArrow).join("; ")}`,
          ).toContain(formatElectronLocus(curvedArrow.destination));
          drawnArrows.push(curvedArrow);
        }
      }
    }
  });
});

describe("a metal cation as an electrophile", () => {
  test("an alkene's π bond can take a new bond to Hg²⁺ (oxymercuration)", () => {
    const graph = stateGraphFromMappedSmiles("[CH2:1]=[CH2:2].[Hg+2:3]");
    const source = parseCurvedArrow("π C1-C2 -> σ C1-Hg3").source;
    expect(newBondDestinations(graph, source, []).map(formatElectronLocus)).toContain("σ C1-Hg3");
  });
});

describe("a 1,2-shift onto a cation", () => {
  /** A secondary cation next to a C–H (3-methylbutan-2-ol after losing water), laid out by hand. */
  function shiftDrawing(): { drawing: StateDrawing; graph: StateGraph } {
    const graph = stateGraphFromMappedSmiles("[CH3:1][CH+:2][C:3]([H:9])([CH3:4])[CH3:6]");
    const mapNumberToCoordinates = {
      "1": [-2.6, 0.75], "2": [-1.3, 0], "3": [0, 0.75], "4": [1.3, 0], "6": [0, 2.25],
      "9": [-0.75, 1.8],
    } as const; // prettier-ignore
    const displayFields = { mapNumberToCoordinates } as unknown as StateDisplayFields;
    const scale = reactionScale(graph, displayFields.mapNumberToCoordinates);
    return { drawing: drawState(graph, displayFields, scale), graph };
  }

  test("pointing at the cation means the shift; the middle of the C–C bond means a π bond", () => {
    const { drawing, graph } = shiftDrawing();
    const source = parseCurvedArrow("σ C3-H9 -> σ C2-H9").source;
    const places = destinationTargets(drawing, graph, {
      source,
      arrowType: "pair",
      drawnArrows: [],
    });
    const cation = drawnAtomOf(drawing, 2).point;
    expect(nearestDestinationTarget(places, cation)?.target.pickTargetId).toBe("newBond:2-9");
    const c3 = drawnAtomOf(drawing, 3).point;
    const bondMiddle = { x: (cation.x + c3.x) / 2, y: (cation.y + c3.y) / 2 };
    expect(
      formatElectronLocus(nearestDestinationTarget(places, bondMiddle)?.destination ?? source),
    ).toBe("π C2-C3");
  });
});
