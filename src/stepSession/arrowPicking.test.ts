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

const SN2 = stateGraphFromMappedSmiles("[OH-:1].[CH3:2][Br:3]");
const ALDOL_START = stateGraphFromMappedSmiles("[H:2][O-:1].[H:4][CH2:3][CH:5]=[O:6]");
const ENOLATE_AND_ALDEHYDE = stateGraphFromMappedSmiles(
  "[H:2][O:1][H:4].[CH2:3]=[CH:5][O-:6].[CH3:8][CH:9]=[O:10]",
);
const RADICAL = stateGraphFromMappedSmiles("[Br:1].[H:2][CH3:3].[Br:4][Br:5]");

const atom = (mapNumber: number): TappedPlace => ({ placeKind: "atom", mapNumber });
const lonePair = (mapNumber: number): TappedPlace => ({ placeKind: "lonePair", mapNumber });
const bond = (first: number, second: number): TappedPlace => ({
  placeKind: "bond",
  mapNumbers: [first, second],
});
const unpaired = (mapNumber: number): TappedPlace => ({ placeKind: "unpairedElectron", mapNumber });

function sourceText(pick: SourcePick): string {
  return pick.pickOutcome === "source" ? formatElectronLocus(pick.source) : "refused";
}

function destinationText(pick: DestinationPick): string {
  if (pick.pickOutcome === "destination") {
    return formatElectronLocus(pick.destination);
  }
  return pick.pickOutcome === "choice"
    ? `choice: ${pick.destinationOptions.map(formatElectronLocus).join(" | ")}`
    : "refused";
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

  test("an atom bonded to neither asks which atom forms the bond", () => {
    const source = sourceOf(tapToSourceLocus(ENOLATE_AND_ALDEHYDE, bond(3, 5), [], "pair"));
    expect(
      destinationText(tapToDestinationLocus(ENOLATE_AND_ALDEHYDE, source, atom(9), "pair")),
    ).toBe("choice: σ C3-C9 | σ C5-C9");
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
