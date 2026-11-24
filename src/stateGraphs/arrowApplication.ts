/**
 * Apply the curved arrows of one step to a state, or a change step's added and removed molecules.
 *
 * The TypeScript twin of python/state_graphs/arrow_application.py, whose module docstring says
 * how arrows move electrons and lists the generic rule ids in the order they are checked. Both
 * pass the shared cases in fixtures/state_graphs/arrow_application_cases.json.
 */
import {
  type CurvedArrow,
  type ElectronLocus,
  formatCurvedArrow,
} from "../arrowNotation/curvedArrowNotation.js";
import {
  bondKey,
  bondKeyMapNumbers,
  lonePairCount,
  maximumValenceShellElectrons,
  type StateAtom,
  type StateGraph,
  unpairedElectronCount,
  valenceShellElectronCount,
} from "./stateGraph.js";

const MAXIMUM_BOND_ORDER = 3; // a triple bond

export type ArrowApplicationRuleId =
  | "atom-not-in-state"
  | "destination-not-adjacent-to-source"
  | "no-electrons-at-source"
  | "destination-bond-already-exists"
  | "destination-bond-missing"
  | "fish-hook-to-lone-pair"
  | "odd-electrons-in-bond"
  | "bond-order-above-three"
  | "octet-exceeded";

/** Arrows that cannot be applied to the state; `genericRuleId` says which rule they break. */
export class ArrowApplicationError extends Error {
  readonly genericRuleId: ArrowApplicationRuleId;

  constructor(genericRuleId: ArrowApplicationRuleId, message: string) {
    super(message);
    this.name = "ArrowApplicationError";
    this.genericRuleId = genericRuleId;
  }
}

export type SpeciesChangeErrorCode = "added-map-number-in-use" | "removed-map-number-absent";

/** A change step that does not fit the state; `errorCode` says why. */
export class SpeciesChangeError extends Error {
  readonly errorCode: SpeciesChangeErrorCode;

  constructor(errorCode: SpeciesChangeErrorCode, message: string) {
    super(message);
    this.name = "SpeciesChangeError";
    this.errorCode = errorCode;
  }
}

function isBondLocus(locus: ElectronLocus): boolean {
  return locus.locusKind === "sigmaBond" || locus.locusKind === "piBond";
}

/** The bond key of a bond locus, or of the single atom's map number for an atom locus. */
function locusBondKey(locus: ElectronLocus): string {
  const [firstAtom, secondAtom] = locus.atoms;
  return bondKey(firstAtom.mapNumber, secondAtom?.mapNumber ?? firstAtom.mapNumber);
}

function atomOf(graph: StateGraph, mapNumber: number): StateAtom {
  const atom = graph.mapNumberToAtom.get(mapNumber);
  if (atom === undefined) {
    throw new Error(`the state has no atom ${String(mapNumber)}`);
  }
  return atom;
}

/** Rule 1: every atom label names an atom of the state, with the right element. */
function checkAtomsInState(graph: StateGraph, curvedArrow: CurvedArrow): void {
  for (const atomLabel of [...curvedArrow.source.atoms, ...curvedArrow.destination.atoms]) {
    if (graph.mapNumberToAtom.get(atomLabel.mapNumber)?.element !== atomLabel.element) {
      throw new ArrowApplicationError(
        "atom-not-in-state",
        `"${formatCurvedArrow(curvedArrow)}": the state has no atom ` +
          `${atomLabel.element}${String(atomLabel.mapNumber)}`,
      );
    }
  }
}

/** Rule 2: electrons move to a neighbouring place, so source and destination share an atom. */
function checkAdjacent(curvedArrow: CurvedArrow): void {
  const sourceMapNumbers = new Set(curvedArrow.source.atoms.map((atom) => atom.mapNumber));
  if (!curvedArrow.destination.atoms.some((atom) => sourceMapNumbers.has(atom.mapNumber))) {
    throw new ArrowApplicationError(
      "destination-not-adjacent-to-source",
      `"${formatCurvedArrow(curvedArrow)}": the electrons must end next to where they start`,
    );
  }
}

function sourceHoldsElectrons(graph: StateGraph, source: ElectronLocus): boolean {
  const sourceAtom = atomOf(graph, source.atoms[0].mapNumber);
  if (source.locusKind === "lonePair") {
    return lonePairCount(sourceAtom) >= 1;
  }
  if (source.locusKind === "unpairedElectron") {
    return unpairedElectronCount(sourceAtom) >= 1;
  }
  // A σ source needs a bond; a π source needs at least a double bond.
  const minimumOrder = source.locusKind === "sigmaBond" ? 1 : 2;
  return (graph.bondToOrder.get(locusBondKey(source)) ?? 0) >= minimumOrder;
}

/** Rules 3 to 5, on the state before any arrow is applied. */
function checkSourceAndDestination(graph: StateGraph, curvedArrow: CurvedArrow): void {
  const notation = formatCurvedArrow(curvedArrow);
  const { destination } = curvedArrow;
  if (!sourceHoldsElectrons(graph, curvedArrow.source)) {
    throw new ArrowApplicationError(
      "no-electrons-at-source",
      `"${notation}": there are no such electrons to move`,
    );
  }
  const isBonded = graph.bondToOrder.has(locusBondKey(destination));
  if (destination.locusKind === "sigmaBond" && isBonded) {
    throw new ArrowApplicationError(
      "destination-bond-already-exists",
      `"${notation}": these atoms are already bonded; a further bond is a π bond`,
    );
  }
  if (destination.locusKind === "piBond" && !isBonded) {
    throw new ArrowApplicationError(
      "destination-bond-missing",
      `"${notation}": a π bond needs a σ bond between the atoms first`,
    );
  }
  if (destination.locusKind === "lonePair" && curvedArrow.electronsMoved === 1) {
    throw new ArrowApplicationError(
      "fish-hook-to-lone-pair",
      `"${notation}": one electron cannot become a lone pair; use rad for an unpaired one`,
    );
  }
}

/** Electrons gained (negative: lost) per atom's nonbonding electrons and per bond. */
interface ElectronChanges {
  readonly mapNumberToNonbondingChange: Map<number, number>;
  readonly bondToElectronChange: Map<string, number>;
}

function addTo<Key>(changes: Map<Key, number>, key: Key, amount: number): void {
  changes.set(key, (changes.get(key) ?? 0) + amount);
}

function electronChangesOf(curvedArrows: readonly CurvedArrow[]): ElectronChanges {
  const changes: ElectronChanges = {
    mapNumberToNonbondingChange: new Map(),
    bondToElectronChange: new Map(),
  };
  for (const curvedArrow of curvedArrows) {
    for (const [locus, sign] of [
      [curvedArrow.source, -1],
      [curvedArrow.destination, 1],
    ] as const) {
      const electronChange = sign * curvedArrow.electronsMoved;
      if (isBondLocus(locus)) {
        addTo(changes.bondToElectronChange, locusBondKey(locus), electronChange);
      } else {
        addTo(changes.mapNumberToNonbondingChange, locus.atoms[0].mapNumber, electronChange);
      }
    }
  }
  return changes;
}

/** "3-5" -> "the bond between atoms 3 and 5", for error messages. */
function describeBond(key: string): string {
  const [firstMapNumber, secondMapNumber] = bondKeyMapNumbers(key);
  return `the bond between atoms ${String(firstMapNumber)} and ${String(secondMapNumber)}`;
}

/** Rules 6 to 8 for bonds: each bond's electrons after the arrows, as a bond order. */
function bondOrdersAfter(
  graph: StateGraph,
  bondToElectronChange: ReadonlyMap<string, number>,
): Map<string, number> {
  const bondToOrder = new Map(graph.bondToOrder);
  for (const [key, electronChange] of [...bondToElectronChange].sort(([first], [second]) =>
    compareBondKeys(first, second),
  )) {
    const bondElectronCount = 2 * (bondToOrder.get(key) ?? 0) + electronChange;
    const bondLabel = describeBond(key);
    if (bondElectronCount % 2 !== 0) {
      throw new ArrowApplicationError(
        "odd-electrons-in-bond",
        `${bondLabel} would hold ${String(bondElectronCount)} electrons; a bond holds pairs`,
      );
    }
    if (bondElectronCount < 0) {
      throw new ArrowApplicationError(
        "no-electrons-at-source",
        `${bondLabel} would lose more electrons than it has`,
      );
    }
    if (bondElectronCount / 2 > MAXIMUM_BOND_ORDER) {
      throw new ArrowApplicationError(
        "bond-order-above-three",
        `${bondLabel} would have order ${String(bondElectronCount / 2)}`,
      );
    }
    bondToOrder.set(key, bondElectronCount / 2);
  }
  return new Map([...bondToOrder].filter(([, order]) => order > 0));
}

function compareBondKeys(first: string, second: string): number {
  const [firstSmaller, firstLarger] = bondKeyMapNumbers(first);
  const [secondSmaller, secondLarger] = bondKeyMapNumbers(second);
  return firstSmaller - secondSmaller || firstLarger - secondLarger;
}

/** Each atom's nonbonding electrons after the arrows (rule 7 for atoms). */
function atomsAfter(
  graph: StateGraph,
  mapNumberToNonbondingChange: ReadonlyMap<number, number>,
): Map<number, StateAtom> {
  const mapNumberToAtom = new Map(graph.mapNumberToAtom);
  for (const [mapNumber, electronChange] of [...mapNumberToNonbondingChange].sort(
    ([first], [second]) => first - second,
  )) {
    const atom = atomOf(graph, mapNumber);
    const nonbondingElectronCount = atom.nonbondingElectronCount + electronChange;
    if (nonbondingElectronCount < 0) {
      throw new ArrowApplicationError(
        "no-electrons-at-source",
        `${atom.element}${String(mapNumber)} would give away more electrons than it has`,
      );
    }
    mapNumberToAtom.set(mapNumber, { ...atom, nonbondingElectronCount });
  }
  return mapNumberToAtom;
}

/** Rule 9, for the atoms an arrow touched (others are as the author drew them). */
function checkOctets(graph: StateGraph, touchedMapNumbers: ReadonlySet<number>): void {
  for (const mapNumber of [...touchedMapNumbers].sort((first, second) => first - second)) {
    const { element } = atomOf(graph, mapNumber);
    const electronCount = valenceShellElectronCount(graph, mapNumber);
    const maximum = maximumValenceShellElectrons(element);
    if (electronCount > maximum) {
      throw new ArrowApplicationError(
        "octet-exceeded",
        `${element}${String(mapNumber)} would have ${String(electronCount)} valence-shell ` +
          `electrons (at most ${String(maximum)})`,
      );
    }
  }
}

/** The state after all `curvedArrows` move their electrons at once; `graph` is not changed. */
export function applyCurvedArrows(
  graph: StateGraph,
  curvedArrows: readonly CurvedArrow[],
): StateGraph {
  for (const curvedArrow of curvedArrows) {
    checkAtomsInState(graph, curvedArrow);
    checkAdjacent(curvedArrow);
    checkSourceAndDestination(graph, curvedArrow);
  }
  const changes = electronChangesOf(curvedArrows);
  const bondToOrder = bondOrdersAfter(graph, changes.bondToElectronChange);
  const appliedGraph: StateGraph = {
    mapNumberToAtom: atomsAfter(graph, changes.mapNumberToNonbondingChange),
    bondToOrder,
  };
  const touchedMapNumbers = new Set(
    curvedArrows.flatMap((curvedArrow) =>
      [...curvedArrow.source.atoms, ...curvedArrow.destination.atoms].map((atom) => atom.mapNumber),
    ),
  );
  checkOctets(appliedGraph, touchedMapNumbers);
  return appliedGraph;
}

/** The map numbers of the molecule (connected fragment) that contains `startMapNumber`. */
function moleculeMapNumbers(graph: StateGraph, startMapNumber: number): Set<number> {
  const moleculeMembers = new Set([startMapNumber]);
  const mapNumbersToVisit = [startMapNumber];
  for (
    let currentMapNumber = mapNumbersToVisit.pop();
    currentMapNumber !== undefined;
    currentMapNumber = mapNumbersToVisit.pop()
  ) {
    for (const key of graph.bondToOrder.keys()) {
      const [firstMapNumber, secondMapNumber] = bondKeyMapNumbers(key);
      const neighbour =
        firstMapNumber === currentMapNumber
          ? secondMapNumber
          : secondMapNumber === currentMapNumber
            ? firstMapNumber
            : undefined;
      if (neighbour !== undefined && !moleculeMembers.has(neighbour)) {
        moleculeMembers.add(neighbour);
        mapNumbersToVisit.push(neighbour);
      }
    }
  }
  return moleculeMembers;
}

/**
 * The state with `addedSpecies` added and, for each map number in `removedFragmentMapNumbers`,
 * the whole molecule containing that atom removed.
 */
export function applySpeciesChange(
  graph: StateGraph,
  addedSpecies: StateGraph | undefined,
  removedFragmentMapNumbers: readonly number[],
): StateGraph {
  const removedMapNumbers = new Set<number>();
  for (const mapNumber of removedFragmentMapNumbers) {
    if (!graph.mapNumberToAtom.has(mapNumber)) {
      throw new SpeciesChangeError(
        "removed-map-number-absent",
        `map number ${String(mapNumber)} is not in the state`,
      );
    }
    moleculeMapNumbers(graph, mapNumber).forEach((member) => removedMapNumbers.add(member));
  }
  const mapNumberToAtom = new Map(
    [...graph.mapNumberToAtom].filter(([mapNumber]) => !removedMapNumbers.has(mapNumber)),
  );
  const bondToOrder = new Map(
    [...graph.bondToOrder].filter(
      ([key]) => !bondKeyMapNumbers(key).some((mapNumber) => removedMapNumbers.has(mapNumber)),
    ),
  );
  for (const [mapNumber, atom] of addedSpecies?.mapNumberToAtom ?? []) {
    if (graph.mapNumberToAtom.has(mapNumber)) {
      throw new SpeciesChangeError(
        "added-map-number-in-use",
        `map number ${String(mapNumber)} is already in the state`,
      );
    }
    mapNumberToAtom.set(mapNumber, atom);
  }
  addedSpecies?.bondToOrder.forEach((order, key) => bondToOrder.set(key, order));
  return { mapNumberToAtom, bondToOrder };
}
