/** Tests for stateDrawing.ts on states of the example reactions (fixtures/reactions). */
import { describe, expect, test } from "vitest";
import { stateGraphFromMappedSmiles } from "../../../core/stateGraphs/mappedSmilesReading.js";
import { exampleReactionDocuments, isRecord } from "../../../testSupport/fixtureFiles.js";
import { plainLabel } from "../shared/atomLabels.js";
import { reactionScale } from "../shared/drawingLayout.js";
import { distanceBetween } from "../shared/planeGeometry.js";
import {
  type AbbreviatedGroup,
  ELECTRON_DOT_DISTANCE,
  HYDROGEN_ROW_OFFSET,
  LABEL_CHARACTER_WIDTH,
  type ReactionDisplayFields,
  type StateDisplayFields,
  type StateDrawing,
  drawState,
  drawnAtomOf,
} from "./stateDrawing.js";

interface ExampleState {
  readonly mappedSmiles: string;
  readonly displayFields: StateDisplayFields;
  readonly reactionDisplay: ReactionDisplayFields;
}

function exampleState(reactionSlug: string, stateId: string): ExampleState {
  const found = exampleReactionDocuments().find(([name]) => name === `${reactionSlug}.json`);
  const document = found?.[1];
  const states = document?.["stateIdToState"];
  const state = isRecord(states) ? states[stateId] : undefined;
  if (document === undefined || !isRecord(state) || typeof state["mappedSmiles"] !== "string") {
    throw new Error(`no state ${stateId} in ${reactionSlug}`);
  }
  return {
    mappedSmiles: state["mappedSmiles"],
    displayFields: state as unknown as StateDisplayFields,
    // The schema has checked both fields' shape.
    reactionDisplay: {
      spectatorMapNumbers: (document["spectatorMapNumbers"] ?? []) as number[],
      abbreviatedGroups: (document["abbreviatedGroups"] ?? []) as AbbreviatedGroup[],
    },
  };
}

function drawExample(reactionSlug: string, stateId: string, scale = 40): StateDrawing {
  const state = exampleState(reactionSlug, stateId);
  const graph = stateGraphFromMappedSmiles(state.mappedSmiles);
  return drawState(graph, state.displayFields, scale, state.reactionDisplay);
}

function targetIdsOfKind(drawing: StateDrawing, targetKind: string): string[] {
  return drawing.pickTargets
    .filter((target) => target.targetKind === targetKind)
    .map((target) => target.pickTargetId);
}

const SN2 = "sn2-hydroxide-bromomethane";

test("every atom is drawn with its label; spectators are flagged", () => {
  const drawing = drawExample(SN2, "reactants");
  expect(drawing.atoms.map((atom) => atom.mapNumber)).toEqual([1, 2, 3, 4]);
  expect(plainLabel(drawnAtomOf(drawing, 1).labelText)).toBe("OH−");
  expect(plainLabel(drawnAtomOf(drawing, 3).labelText)).toBe("Br");
  expect(drawnAtomOf(drawing, 4).isSpectator).toBe(true);
  expect(drawnAtomOf(drawing, 2).isSpectator).toBe(false);
});

test("atoms sit at their coordinates times the scale, y flipped", () => {
  const coordinates = exampleState(SN2, "reactants").displayFields.mapNumberToCoordinates;
  const drawing = drawExample(SN2, "reactants", 40);
  for (const atom of drawing.atoms) {
    const [across = 0, upward = 0] = coordinates[String(atom.mapNumber)] ?? [];
    expect(atom.point.x).toBeCloseTo(across * 40);
    expect(atom.point.y).toBeCloseTo(-upward * 40);
  }
});

test("one bond with a bond target; spectators get no targets", () => {
  const drawing = drawExample(SN2, "reactants");
  expect(drawing.bonds.map((bond) => bond.mapNumbers)).toEqual([[2, 3]]);
  expect(targetIdsOfKind(drawing, "bond")).toEqual(["bond:2-3"]);
  expect(targetIdsOfKind(drawing, "atom")).toEqual(["atom:1", "atom:2", "atom:3"]);
  const bondTarget = drawing.pickTargets.find((target) => target.pickTargetId === "bond:2-3");
  expect(bondTarget?.accessibleName).toBe("bond C2–Br3");
  expect(bondTarget?.mapNumbers).toEqual([2, 3]);
});

test("every lone pair is drawn and is its own target", () => {
  const drawing = drawExample(SN2, "reactants");
  // HO⁻: three lone pairs; Br (one bond): three; CH₃: none.
  expect(targetIdsOfKind(drawing, "lonePair")).toEqual([
    "lonePair:1:0",
    "lonePair:1:1",
    "lonePair:1:2",
    "lonePair:3:0",
    "lonePair:3:1",
    "lonePair:3:2",
  ]);
  const lonePair = drawing.electronDots.find((dot) => dot.mapNumber === 1);
  expect(lonePair?.dotPoints).toHaveLength(2);
  expect(
    distanceBetween(lonePair?.center ?? { x: 0, y: 0 }, drawnAtomOf(drawing, 1).point),
  ).toBeCloseTo(ELECTRON_DOT_DISTANCE);
  const target = drawing.pickTargets.find((candidate) => candidate.pickTargetId === "lonePair:1:0");
  expect(target?.accessibleName).toBe("lone pair on O1");
});

test("an unpaired electron is one dot and its own target", () => {
  const drawing = drawExample("radical-bromination-methane", "reactants");
  expect(targetIdsOfKind(drawing, "unpairedElectron")).toEqual(["unpairedElectron:1"]);
  const radicalDot = drawing.electronDots.find((dot) => dot.dotKind === "unpairedElectron");
  expect(radicalDot?.dotPoints).toHaveLength(1);
  expect(drawing.electronDots.filter((dot) => dot.mapNumber === 1)).toHaveLength(4);
});

test("a carbanion's lone pair is drawn", () => {
  const drawing = drawExample("wittig-methylenation-cyclohexanone", "reactants");
  expect(targetIdsOfKind(drawing, "lonePair").filter((id) => id.startsWith("lonePair:2:"))).toEqual(
    ["lonePair:2:0"],
  );
});

test("targets stack atoms first, then bonds, then electron dots (on top)", () => {
  const kinds = drawExample(SN2, "reactants").pickTargets.map((target) => target.targetKind);
  expect(kinds.lastIndexOf("atom")).toBeLessThan(kinds.indexOf("bond"));
  expect(kinds.lastIndexOf("bond")).toBeLessThan(kinds.indexOf("lonePair"));
});

test("no electron dot sits where the charge is written (upper right of the label)", () => {
  const drawing = drawExample("aldol-addition-base", "enolate");
  const chargeDirection = -Math.PI / 4;
  const oxygenDots = drawing.electronDots.filter((dot) => dot.mapNumber === 6);
  expect(oxygenDots).toHaveLength(3);
  for (const dot of oxygenDots) {
    expect(Math.cos(dot.angle - chargeDirection)).toBeLessThan(Math.cos(Math.PI / 6));
  }
});

test("the view box also holds each label's text, hydrogens and charge included", () => {
  const drawing = drawExample("wittig-methylenation-cyclohexanone", "reactants");
  const carbanion = drawnAtomOf(drawing, 2);
  // "CH₂⁻": four characters right of the atom's centre, less half the element's width.
  const labelRightEdge = carbanion.point.x + 3.5 * LABEL_CHARACTER_WIDTH;
  expect(drawing.viewBox.minX + drawing.viewBox.width).toBeGreaterThan(labelRightEdge);
});

test("where the hydrogens and the charge are written", () => {
  const sn2 = drawExample(SN2, "reactants");
  const methyl = drawnAtomOf(sn2, 2);
  expect(methyl.hydrogenTextAnchor).toBe("end");
  expect(methyl.hydrogenTextPoint?.x).toBeLessThan(methyl.point.x);
  const hydroxide = drawnAtomOf(sn2, 1);
  expect(hydroxide.chargePoint?.y).toBeLessThan(hydroxide.point.y);
  expect(hydroxide.chargePoint?.x).toBeGreaterThan(hydroxide.hydrogenTextPoint?.x ?? Infinity);
  expect(drawnAtomOf(sn2, 3).hydrogenTextPoint).toBeNull();
  expect(drawnAtomOf(sn2, 3).chargePoint).toBeNull();
  // The aldehyde CH, both bonds pointing down: its H is written above, centred.
  const aldehyde = drawnAtomOf(drawExample("aldol-addition-base", "reactants"), 5);
  expect(aldehyde.labelText.hydrogenSide).toBe("above");
  expect(aldehyde.hydrogenTextAnchor).toBe("middle");
  expect(aldehyde.hydrogenTextPoint).toEqual({
    x: aldehyde.point.x,
    y: aldehyde.point.y - HYDROGEN_ROW_OFFSET,
  });
});

test("an annotation sits straight above or below its atom, clear of the electron dots", () => {
  const drawing = drawExample(SN2, "reactants");
  const [annotation] = drawing.annotations;
  const oxygen = drawnAtomOf(drawing, 1).point;
  expect(annotation?.point.x).toBeCloseTo(oxygen.x);
  expect(Math.abs((annotation?.point.y ?? 0) - oxygen.y)).toBeGreaterThanOrEqual(30);
});

test("caption and annotations are drawn; the view box holds every atom", () => {
  const drawing = drawExample(SN2, "reactants");
  expect(drawing.caption).toBe("hydroxide + bromomethane");
  expect(drawing.annotations.map((annotation) => annotation.text)).toEqual(["nucleophile"]);
  const box = drawing.viewBox;
  for (const atom of drawing.atoms) {
    expect(atom.point.x).toBeGreaterThan(box.minX);
    expect(atom.point.x).toBeLessThan(box.minX + box.width);
    expect(atom.point.y).toBeGreaterThan(box.minY);
    expect(atom.point.y).toBeLessThan(box.minY + box.height);
  }
});

test("every state of every example can be drawn at the reaction's scale", () => {
  for (const [name, document] of exampleReactionDocuments()) {
    const states = document["stateIdToState"];
    const startId = document["startStateId"];
    if (!isRecord(states) || typeof startId !== "string") {
      throw new Error(`${name}: no states`);
    }
    const start = exampleState(name.replace(".json", ""), startId);
    const scale = reactionScale(
      stateGraphFromMappedSmiles(start.mappedSmiles),
      start.displayFields.mapNumberToCoordinates,
    );
    for (const stateId of Object.keys(states)) {
      const drawing = drawExample(name.replace(".json", ""), stateId, scale);
      expect(drawing.atoms.length).toBeGreaterThan(0);
    }
  }
});

describe("abbreviated groups", () => {
  const WITTIG = "wittig-methylenation-cyclohexanone";

  test("an intact phenyl is drawn as Ph at its attachment atom, joined by one bond", () => {
    const drawing = drawExample(WITTIG, "reactants");
    const mapNumbers = drawing.atoms.map((atom) => atom.mapNumber);
    expect(mapNumbers).toContain(11);
    for (const hidden of [12, 13, 14, 15, 16, 22, 36]) {
      expect(mapNumbers).not.toContain(hidden);
    }
    expect(plainLabel(drawnAtomOf(drawing, 11).labelText)).toBe("Ph");
    const bondKeys = drawing.bonds.map((bond) => bond.mapNumbers.join("-"));
    expect(bondKeys).toContain("1-11");
    expect(bondKeys).not.toContain("11-12");
    expect(drawing.atoms).toHaveLength(27 - 3 * 5);
  });

  test("nothing in a group can be tapped, the attachment bond included", () => {
    const drawing = drawExample(WITTIG, "oxaphosphetane");
    const groupAtoms = new Set([11, 12, 13, 14, 15, 16, 21, 22, 23, 24, 25, 26]);
    for (const target of drawing.pickTargets) {
      expect(target.mapNumbers.some((mapNumber) => groupAtoms.has(mapNumber))).toBe(false);
    }
    expect(drawing.pickTargets.map((target) => target.pickTargetId)).toContain("atom:1");
  });

  test("a group that is not intact in a state is drawn in full there", () => {
    const sn2 = exampleState(SN2, "reactants");
    const bromineAsGroup: ReactionDisplayFields = {
      ...sn2.reactionDisplay,
      abbreviatedGroups: [{ groupLabel: "X", attachmentMapNumber: 3, mapNumbers: [3] }],
    };
    const draw = (stateId: string): StateDrawing => {
      const state = exampleState(SN2, stateId);
      return drawState(
        stateGraphFromMappedSmiles(state.mappedSmiles),
        state.displayFields,
        40,
        bromineAsGroup,
      );
    };
    // Reactants: Br hangs off carbon by one bond. Products: bromide is on its own.
    expect(plainLabel(drawnAtomOf(draw("reactants"), 3).labelText)).toBe("X");
    expect(plainLabel(drawnAtomOf(draw("products"), 3).labelText)).toBe("Br−");
  });
});
