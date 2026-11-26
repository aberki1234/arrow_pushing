/** Tests for arrowPicking.ts on states of the example reactions. */
import { describe, expect, test } from "vitest";
import {
  type ElectronLocus,
  formatElectronLocus,
  parseCurvedArrow,
} from "../arrowNotation/curvedArrowNotation.js";
import { stateGraphFromMappedSmiles } from "../stateGraphs/mappedSmilesReading.js";
import {
  type ArrowType,
  type DestinationPick,
  type SourcePick,
  type TappedPlace,
  electronsMovedBy,
  tapToDestinationLocus,
  tapToSourceLocus,
} from "./arrowPicking.js";
import { newBondDestinations } from "./newBondDestinations.js";

const SN2 = stateGraphFromMappedSmiles("[OH-:1].[CH3:2][Br:3]");
const ALDOL_START = stateGraphFromMappedSmiles("[H:2][O-:1].[H:4][CH2:3][CH:5]=[O:6]");
const ENOLATE_AND_ALDEHYDE = stateGraphFromMappedSmiles(
  "[H:2][O:1][H:4].[CH2:3]=[CH:5][O-:6].[CH3:8][CH:9]=[O:10]",
);
const RADICAL = stateGraphFromMappedSmiles("[Br:1].[H:2][CH3:3].[Br:4][Br:5]");
const PROPYL_CATION = stateGraphFromMappedSmiles("[CH3:1][CH:2]([H:5])[CH2+:3]");
const PROPYL_CHLORIDE = stateGraphFromMappedSmiles("[CH3:1][CH:2]([H:5])[CH2:3][Cl:4]");
const PROPYL_CATION_AND_WATER = stateGraphFromMappedSmiles("[CH3:1][CH:2]([H:5])[CH2+:3].[OH2:6]");

const atom = (mapNumber: number): TappedPlace => ({ placeKind: "atom", mapNumber });
const lonePair = (mapNumber: number): TappedPlace => ({ placeKind: "lonePair", mapNumber });
const bond = (first: number, second: number): TappedPlace => ({
  placeKind: "bond",
  mapNumbers: [first, second],
});
const unpaired = (mapNumber: number): TappedPlace => ({ placeKind: "unpairedElectron", mapNumber });
const newBond = (first: number, second: number): TappedPlace => ({
  placeKind: "newBond",
  mapNumbers: [first, second],
});

function sourceText(pick: SourcePick): string {
  return pick.pickOutcome === "source" ? formatElectronLocus(pick.source) : "refused";
}

function destinationText(pick: DestinationPick): string {
  if (pick.pickOutcome === "destination") {
    return formatElectronLocus(pick.destination);
  }
  return "refused";
}

function sourceOf(pick: SourcePick): ElectronLocus {
  if (pick.pickOutcome !== "source") {
    throw new Error(`expected a source, got ${pick.refusalMessage}`);
  }
  return pick.source;
}

test("electrons moved by each arrow type", () => {
  expect(electronsMovedBy("pair")).toBe(2);
  expect(electronsMovedBy("fishHook")).toBe(1);
});

describe("sources", () => {
  test("a lone pair, a single bond, an unpaired electron", () => {
    expect(sourceText(tapToSourceLocus(SN2, lonePair(1), [], "pair"))).toBe("lp O1");
    expect(sourceText(tapToSourceLocus(SN2, bond(2, 3), [], "pair"))).toBe("σ C2-Br3");
    expect(sourceText(tapToSourceLocus(RADICAL, unpaired(1), [], "fishHook"))).toBe("rad Br1");
  });

  test("a double bond gives π first, then σ once its π electrons are used", () => {
    const first = tapToSourceLocus(ENOLATE_AND_ALDEHYDE, bond(3, 5), [], "pair");
    expect(sourceText(first)).toBe("π C3-C5");
    const drawn = [parseCurvedArrow("π C3-C5 -> σ C3-C9")];
    expect(sourceText(tapToSourceLocus(ENOLATE_AND_ALDEHYDE, bond(3, 5), drawn, "pair"))).toBe(
      "σ C3-C5",
    );
  });

  test("fish-hooks take one electron at a time from a single bond", () => {
    const once = [parseCurvedArrow("σ H2-C3 ~> σ Br1-H2")];
    expect(sourceText(tapToSourceLocus(RADICAL, bond(2, 3), once, "fishHook"))).toBe("σ H2-C3");
    const twice = [...once, parseCurvedArrow("σ H2-C3 ~> rad C3")];
    const refused = tapToSourceLocus(RADICAL, bond(2, 3), twice, "fishHook");
    expect(refused.pickOutcome).toBe("refused");
  });

  test("an unpaired electron with a pair arrow, and an atom, are refused", () => {
    const pairFromRadical = tapToSourceLocus(RADICAL, unpaired(1), [], "pair");
    expect(pairFromRadical.pickOutcome).toBe("refused");
    expect(pairFromRadical.pickOutcome === "refused" && pairFromRadical.refusalMessage).toMatch(
      /fish-hook/,
    );
    expect(tapToSourceLocus(SN2, atom(2), [], "pair").pickOutcome).toBe("refused");
  });
});

describe("destinations from a lone pair", () => {
  const source = sourceOf(tapToSourceLocus(SN2, lonePair(1), [], "pair"));

  test("an unbonded atom makes a new σ bond; a lone pair tapped means its atom", () => {
    expect(destinationText(tapToDestinationLocus(SN2, source, atom(2), "pair"))).toBe("σ O1-C2");
    expect(destinationText(tapToDestinationLocus(SN2, source, lonePair(3), "pair"))).toBe(
      "σ O1-Br3",
    );
  });

  test("its own atom and a bond not touching it are refused", () => {
    expect(destinationText(tapToDestinationLocus(SN2, source, atom(1), "pair"))).toBe("refused");
    expect(destinationText(tapToDestinationLocus(SN2, source, bond(2, 3), "pair"))).toBe("refused");
  });

  test("a bonded atom or the bond to it gains a π bond", () => {
    const enolateOxygen = sourceOf(tapToSourceLocus(ENOLATE_AND_ALDEHYDE, lonePair(6), [], "pair"));
    expect(
      destinationText(tapToDestinationLocus(ENOLATE_AND_ALDEHYDE, enolateOxygen, atom(5), "pair")),
    ).toBe("π C5-O6");
    expect(
      destinationText(
        tapToDestinationLocus(ENOLATE_AND_ALDEHYDE, enolateOxygen, bond(5, 6), "pair"),
      ),
    ).toBe("π C5-O6");
  });
});

describe("destinations from a bond", () => {
  test("one of its own atoms: a lone pair, or the unpaired electron for a fish-hook", () => {
    const source = sourceOf(tapToSourceLocus(SN2, bond(2, 3), [], "pair"));
    expect(destinationText(tapToDestinationLocus(SN2, source, atom(3), "pair"))).toBe("lp Br3");
    const radicalSource = sourceOf(tapToSourceLocus(RADICAL, bond(2, 3), [], "fishHook"));
    expect(
      destinationText(tapToDestinationLocus(RADICAL, radicalSource, atom(3), "fishHook")),
    ).toBe("rad C3");
  });

  test("an atom bonded to exactly one of its atoms gains a π bond, with no menu", () => {
    const source = sourceOf(tapToSourceLocus(ALDOL_START, bond(3, 4), [], "pair"));
    expect(destinationText(tapToDestinationLocus(ALDOL_START, source, atom(5), "pair"))).toBe(
      "π C3-C5",
    );
  });
});

describe("possible new bonds from a bond source", () => {
  const newBonds = (
    graph: ReturnType<typeof stateGraphFromMappedSmiles>,
    sourceBond: [number, number],
    drawnArrowTexts: string[] = [],
  ): string[] => {
    const drawnArrows = drawnArrowTexts.map(parseCurvedArrow);
    const source = sourceOf(tapToSourceLocus(graph, bond(...sourceBond), drawnArrows, "pair"));
    return newBondDestinations(graph, source, drawnArrows).map(formatElectronLocus);
  };

  test("to an atom of another molecule that can take a bond", () => {
    const dielsAlder = stateGraphFromMappedSmiles("[CH2:1]=[CH:2][CH:3]=[CH2:4].[CH2:5]=[CH2:6]");
    expect(newBonds(dielsAlder, [1, 2])).toEqual(["σ C1-C5", "σ C1-C6", "σ C2-C5", "σ C2-C6"]);
    // The acylium carbon has π bonds to give up; its methyl carbon has nothing to give up.
    const acylium = stateGraphFromMappedSmiles("[CH3:1][C:2]#[O+:3].[CH2:4]=[CH2:5]");
    expect(newBonds(acylium, [4, 5])).toEqual(["σ C2-C4", "σ C2-C5", "σ O3-C4", "σ O3-C5"]);
    // An H on oxygen can be passed across; an H on carbon, or water's oxygen itself, cannot.
    const enolateAndWater = stateGraphFromMappedSmiles(
      "[CH2:1]=[CH:2][O-:3].[H:4][O:5][H:6].[CH4:7]",
    );
    expect(newBonds(enolateAndWater, [1, 2])).toEqual(["σ C1-H4", "σ C1-H6", "σ C2-H4", "σ C2-H6"]);
    // A carbon bonded to a leaving group can take a bond (SN2 by a π bond).
    const alkeneAndBromomethane = stateGraphFromMappedSmiles("[CH2:1]=[CH2:2].[CH3:3][Br:4]");
    expect(newBonds(alkeneAndBromomethane, [1, 2])).toEqual(["σ C1-C3", "σ C2-C3"]);
  });

  test("within a molecule: 1,2-shifts onto an electron-poor atom; rings from 4 bonds", () => {
    expect(newBonds(PROPYL_CATION, [2, 5])).toEqual(["σ C3-H5"]);
    // Onto a carbon losing its leaving group: offered before or after the C–Cl break is drawn.
    expect(newBonds(PROPYL_CHLORIDE, [2, 5])).toEqual(["σ C3-H5"]);
    expect(newBonds(PROPYL_CHLORIDE, [2, 5], ["σ C3-Cl4 -> lp Cl4"])).toEqual(["σ C3-H5"]);
    const hexadiene = stateGraphFromMappedSmiles("[CH2:1]=[CH:2][CH2:3][CH2:4][CH:5]=[CH2:6]");
    // C1–C5 and C2–C6 are 4 bonds apart and C1–C6 5; C2–C5 (3 bonds) and C2–C4 (2, not
    // electron-poor) are left out.
    expect(newBonds(hexadiene, [1, 2])).toEqual(["σ C1-C5", "σ C1-C6", "σ C2-C6"]);
  });

  test("no 1,2-shift of an H a base is already taking", () => {
    expect(newBonds(PROPYL_CATION_AND_WATER, [2, 5], ["lp O6 -> σ O6-H5"])).toEqual([]);
  });
});

describe("possible new bonds, whatever the order", () => {
  const newBonds = (
    graph: ReturnType<typeof stateGraphFromMappedSmiles>,
    sourceBond: [number, number],
    drawnArrowTexts: string[] = [],
  ): string[] => {
    const drawnArrows = drawnArrowTexts.map(parseCurvedArrow);
    const source = sourceOf(tapToSourceLocus(graph, bond(...sourceBond), drawnArrows, "pair"));
    return newBondDestinations(graph, source, drawnArrows).map(formatElectronLocus);
  };

  test("do not depend on the order the arrows are drawn in", () => {
    // Epoxidation: after the π bond has bonded to the peroxide oxygen, the O–H pair can still
    // form the second C–O bond to that same oxygen.
    const peracid = stateGraphFromMappedSmiles("[CH2:1]=[CH2:2].[O:7]=[CH:8][O:9][O:10][H:11]");
    expect(newBonds(peracid, [10, 11], ["π C1-C2 -> σ C1-O10"])).toContain("σ C2-O10");
    // A shift onto an oxygen whose O–O bond has not been drawn breaking yet (borane oxidation).
    const boratePeroxide = stateGraphFromMappedSmiles("[CH3:1][B-:4]([CH3:2])([CH3:3])[O:5][OH:6]");
    expect(newBonds(boratePeroxide, [1, 4])).toContain("σ C1-O5");
  });

  test("an acidic H on carbon can take a bond; a plain C–H cannot", () => {
    const ylideFormation = stateGraphFromMappedSmiles(
      "[Li:4][CH3:5].[H:3][CH2:2][P+:1]([CH3:6])([CH3:7])[CH3:8]",
    );
    expect(newBonds(ylideFormation, [4, 5])).toContain("σ H3-C5");
    const propane = stateGraphFromMappedSmiles("[Li:4][CH3:5].[H:3][CH2:2][CH3:6]");
    expect(newBonds(propane, [4, 5])).not.toContain("σ H3-C5");
  });

  test("a lone pair has none: tapping the atom is enough", () => {
    const source = sourceOf(tapToSourceLocus(SN2, lonePair(1), [], "pair"));
    expect(newBondDestinations(SN2, source, [])).toEqual([]);
  });
});

describe("destinations from a bond, continued", () => {
  test("an atom bonded to neither is refused: the new bond is picked itself", () => {
    const source = sourceOf(tapToSourceLocus(ENOLATE_AND_ALDEHYDE, bond(3, 5), [], "pair"));
    const refusal = tapToDestinationLocus(ENOLATE_AND_ALDEHYDE, source, atom(9), "pair");
    expect(refusal.pickOutcome === "refused" ? refusal.refusalMessage : "").toContain(
      "dashed line",
    );
    expect(
      destinationText(tapToDestinationLocus(ENOLATE_AND_ALDEHYDE, source, newBond(3, 9), "pair")),
    ).toBe("σ C3-C9");
  });

  test("a bond sharing one atom gains a π bond; itself and unrelated bonds are refused", () => {
    const source = sourceOf(tapToSourceLocus(ALDOL_START, bond(3, 4), [], "pair"));
    expect(destinationText(tapToDestinationLocus(ALDOL_START, source, bond(3, 5), "pair"))).toBe(
      "π C3-C5",
    );
    expect(destinationText(tapToDestinationLocus(ALDOL_START, source, bond(3, 4), "pair"))).toBe(
      "refused",
    );
    expect(destinationText(tapToDestinationLocus(ALDOL_START, source, bond(5, 6), "pair"))).toBe(
      "refused",
    );
  });

  test("an unpaired electron's fish-hook to an unbonded atom makes a new σ bond", () => {
    const arrowType: ArrowType = "fishHook";
    const source = sourceOf(tapToSourceLocus(RADICAL, unpaired(1), [], arrowType));
    expect(destinationText(tapToDestinationLocus(RADICAL, source, atom(2), arrowType))).toBe(
      "σ Br1-H2",
    );
  });
});
