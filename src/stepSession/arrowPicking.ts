/**
 * From the learner's taps to the loci of a curved arrow (docs/schema-design.md section 2, "From a
 * learner's tap to a destination locus").
 *
 * Source (decided 2026-11-25): a lone pair or an unpaired electron is its own locus. A bond is one
 * pick target; picked as a source it gives its π electrons while the arrows drawn so far in this
 * set leave some, then its σ electrons. A double bond's first pair arrow is therefore π and a
 * second σ (a bond broken completely); a fish-hook takes one electron at a time. Tapping an atom
 * is not a source.
 *
 * Destination, for the source's atom(s):
 *   lp/rad on X   atom X: refused; atom Y not bonded to X: σ X-Y; atom Y bonded to X, or the
 *                 bond X–Y: π X-Y; any other bond: refused
 *   bond A–B      atom A or B: lp (rad for a fish-hook) on it; a bond B–C: π B-C; the bond A–B
 *                 itself or a bond touching neither: refused; atom Y: π if exactly one of A and B
 *                 is bonded to Y, otherwise a choice between the two ("which atom forms the
 *                 bond?", decided 2026-11-25)
 * Tapping a lone pair or an unpaired electron as a destination means tapping its atom.
 */
import type {
  AtomLabel,
  CurvedArrow,
  ElectronLocus,
} from "../arrowNotation/curvedArrowNotation.js";
import { type StateGraph, bondKey } from "../stateGraphs/stateGraph.js";

export type ArrowType = "pair" | "fishHook";

/** What the learner tapped (a pick target, without its drawing). */
export type TappedPlace =
  | { readonly placeKind: "atom"; readonly mapNumber: number }
  | { readonly placeKind: "lonePair"; readonly mapNumber: number }
  | { readonly placeKind: "unpairedElectron"; readonly mapNumber: number }
  | { readonly placeKind: "bond"; readonly mapNumbers: readonly [number, number] };

export type SourcePick =
  | { readonly pickOutcome: "source"; readonly source: ElectronLocus }
  | { readonly pickOutcome: "refused"; readonly refusalMessage: string };

export type DestinationPick =
  | { readonly pickOutcome: "destination"; readonly destination: ElectronLocus }
  | { readonly pickOutcome: "choice"; readonly destinationOptions: readonly ElectronLocus[] }
  | { readonly pickOutcome: "refused"; readonly refusalMessage: string };

export function electronsMovedBy(arrowType: ArrowType): 1 | 2 {
  return arrowType === "pair" ? 2 : 1;
}

const START_FROM_ELECTRONS =
  "Start from electrons: tap a lone pair, a bond or an unpaired electron.";
const UNPAIRED_NEEDS_FISH_HOOK =
  "An unpaired electron moves on its own: switch to the fish-hook arrow (⇀).";
const BOND_EMPTY = "This bond has no electrons left to move in this step.";
const NOT_TO_ITSELF = "An arrow cannot end where it starts. Tap another atom or a bond.";
const NOT_NEXT_TO_SOURCE =
  "Electrons move to a neighbouring place: an atom, or a bond that touches where they start.";

function atomLabelOf(graph: StateGraph, mapNumber: number): AtomLabel {
  const atom = graph.mapNumberToAtom.get(mapNumber);
  if (atom === undefined) {
    throw new Error(`the state has no atom with map number ${String(mapNumber)}`);
  }
  return { element: atom.element, mapNumber };
}

function atomLocus(
  graph: StateGraph,
  locusKind: "lonePair" | "unpairedElectron",
  mapNumber: number,
): ElectronLocus {
  return { locusKind, atoms: [atomLabelOf(graph, mapNumber)] };
}

function bondLocus(
  graph: StateGraph,
  locusKind: "sigmaBond" | "piBond",
  first: number,
  second: number,
): ElectronLocus {
  const [smaller, larger] = first < second ? [first, second] : [second, first];
  return { locusKind, atoms: [atomLabelOf(graph, smaller), atomLabelOf(graph, larger)] };
}

function bonded(graph: StateGraph, first: number, second: number): boolean {
  return graph.bondToOrder.has(bondKey(first, second));
}

/** Electrons the drawn arrows already take from the bond's σ or π part. */
function electronsTaken(
  drawnArrows: readonly CurvedArrow[],
  locusKind: "sigmaBond" | "piBond",
  key: string,
): number {
  return drawnArrows
    .filter(({ source }) => {
      const [first, second = 0] = source.atoms.map((atom) => atom.mapNumber);
      return source.locusKind === locusKind && bondKey(first ?? 0, second) === key;
    })
    .reduce((sum, curvedArrow) => sum + curvedArrow.electronsMoved, 0);
}

export function tapToSourceLocus(
  graph: StateGraph,
  tapped: TappedPlace,
  drawnArrows: readonly CurvedArrow[],
  arrowType: ArrowType,
): SourcePick {
  const refused = (refusalMessage: string): SourcePick => ({
    pickOutcome: "refused",
    refusalMessage,
  });
  if (tapped.placeKind === "atom") {
    return refused(START_FROM_ELECTRONS);
  }
  if (tapped.placeKind === "lonePair") {
    return { pickOutcome: "source", source: atomLocus(graph, "lonePair", tapped.mapNumber) };
  }
  if (tapped.placeKind === "unpairedElectron") {
    return arrowType === "pair"
      ? refused(UNPAIRED_NEEDS_FISH_HOOK)
      : { pickOutcome: "source", source: atomLocus(graph, "unpairedElectron", tapped.mapNumber) };
  }
  const [first, second] = tapped.mapNumbers;
  const key = bondKey(first, second);
  const bondOrder = graph.bondToOrder.get(key) ?? 0;
  const moved = electronsMovedBy(arrowType);
  if (2 * (bondOrder - 1) - electronsTaken(drawnArrows, "piBond", key) >= moved) {
    return { pickOutcome: "source", source: bondLocus(graph, "piBond", first, second) };
  }
  if (bondOrder >= 1 && 2 - electronsTaken(drawnArrows, "sigmaBond", key) >= moved) {
    return { pickOutcome: "source", source: bondLocus(graph, "sigmaBond", first, second) };
  }
  return refused(BOND_EMPTY);
}

function fromAtomSource(
  graph: StateGraph,
  sourceAtom: number,
  tapped: TappedPlace,
): DestinationPick {
  const refused = (refusalMessage: string): DestinationPick => ({
    pickOutcome: "refused",
    refusalMessage,
  });
  if (tapped.placeKind === "bond") {
    const [first, second] = tapped.mapNumbers;
    if (first !== sourceAtom && second !== sourceAtom) {
      return refused(NOT_NEXT_TO_SOURCE);
    }
    return { pickOutcome: "destination", destination: bondLocus(graph, "piBond", first, second) };
  }
  if (tapped.mapNumber === sourceAtom) {
    return refused(NOT_TO_ITSELF);
  }
  const locusKind = bonded(graph, sourceAtom, tapped.mapNumber) ? "piBond" : "sigmaBond";
  return {
    pickOutcome: "destination",
    destination: bondLocus(graph, locusKind, sourceAtom, tapped.mapNumber),
  };
}

function fromBondSource(
  graph: StateGraph,
  [first, second]: readonly [number, number],
  tapped: TappedPlace,
  arrowType: ArrowType,
): DestinationPick {
  const refused = (refusalMessage: string): DestinationPick => ({
    pickOutcome: "refused",
    refusalMessage,
  });
  if (tapped.placeKind === "bond") {
    const shared = tapped.mapNumbers.filter(
      (mapNumber) => mapNumber === first || mapNumber === second,
    );
    if (shared.length === 2) {
      return refused(NOT_TO_ITSELF);
    }
    return shared.length === 1
      ? {
          pickOutcome: "destination",
          destination: bondLocus(graph, "piBond", ...tapped.mapNumbers),
        }
      : refused(NOT_NEXT_TO_SOURCE);
  }
  const target = tapped.mapNumber;
  if (target === first || target === second) {
    const locusKind = arrowType === "pair" ? "lonePair" : "unpairedElectron";
    return { pickOutcome: "destination", destination: atomLocus(graph, locusKind, target) };
  }
  const firstBonded = bonded(graph, first, target);
  const secondBonded = bonded(graph, second, target);
  if (firstBonded !== secondBonded) {
    const partner = firstBonded ? first : second;
    return { pickOutcome: "destination", destination: bondLocus(graph, "piBond", partner, target) };
  }
  const locusKind = firstBonded ? "piBond" : "sigmaBond";
  return {
    pickOutcome: "choice",
    destinationOptions: [
      bondLocus(graph, locusKind, first, target),
      bondLocus(graph, locusKind, second, target),
    ],
  };
}

export function tapToDestinationLocus(
  graph: StateGraph,
  source: ElectronLocus,
  tapped: TappedPlace,
  arrowType: ArrowType,
): DestinationPick {
  const [first, second] = source.atoms.map((atom) => atom.mapNumber);
  if (second === undefined || first === undefined) {
    return fromAtomSource(graph, first ?? 0, tapped);
  }
  return fromBondSource(graph, [first, second], tapped, arrowType);
}
