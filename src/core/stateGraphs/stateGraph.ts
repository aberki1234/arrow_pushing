/**
 * The state graph: the atoms and bonds of one drawn state, with each atom's electrons counted.
 *
 * Purpose
 *   Applying curved arrows, comparing states and checking octets all need the electrons of each
 *   atom, not just the connectivity. Formal charge and lone pairs are derived from the electron
 *   counts, never stored, so moving electrons always keeps the charge bookkeeping right.
 *
 * Terms (docs/schema-design.md §0)
 *   map number                 Names one atom for the whole reaction.
 *   hydrogen count             Implicit hydrogens on an atom (those not drawn as mapped atoms).
 *   nonbonding electron count  Electrons on the atom that are not in a bond: its lone pairs plus
 *                              any unpaired electron.
 *   bond order                 1, 2 or 3; keyed by the two map numbers, the smaller first.
 *
 * Electron bookkeeping, per atom
 *   formal charge     = valence electrons - nonbonding electrons - bond orders - hydrogen count
 *   unpaired electron = 1 if the nonbonding count is odd, else 0 (an atom with two unpaired
 *                       electrons, e.g. a triplet carbene, is out of scope)
 *   lone pairs        = floor(nonbonding electrons / 2)
 *   valence shell     = nonbonding electrons + 2 * (bond orders + hydrogen count)
 * Worked example: hydroxide [OH-] has 6 valence electrons, charge -1, no bonds and one H, so
 * 6 - nonbonding - 0 - 1 = -1 gives 6 nonbonding electrons: three lone pairs.
 */

/**
 * Valence electrons of each element the content may use: the main-group group number; the s
 * electrons for Zn and Hg (d10 kept as a core); 3 for Ce, its usual Ce(III) state (CeCl3, Luche).
 */
export const ELEMENT_TO_VALENCE_ELECTRONS: ReadonlyMap<string, number> = new Map([
  ["H", 1], ["Li", 1], ["B", 3], ["C", 4], ["N", 5], ["O", 6], ["F", 7],
  ["Na", 1], ["Mg", 2], ["Al", 3], ["Si", 4], ["P", 5], ["S", 6], ["Cl", 7],
  ["K", 1], ["Zn", 2], ["Se", 6], ["Br", 7], ["Sn", 4], ["I", 7], ["Ce", 3], ["Hg", 2],
]); // prettier-ignore

/** Periodic-table period of each element: it sets the most valence-shell electrons allowed. */
export const ELEMENT_TO_PERIOD: ReadonlyMap<string, number> = new Map([
  ["H", 1], ["Li", 2], ["B", 2], ["C", 2], ["N", 2], ["O", 2], ["F", 2],
  ["Na", 3], ["Mg", 3], ["Al", 3], ["Si", 3], ["P", 3], ["S", 3], ["Cl", 3],
  ["K", 4], ["Zn", 4], ["Se", 4], ["Br", 4], ["Sn", 5], ["I", 5], ["Ce", 6], ["Hg", 6],
]); // prettier-ignore

export interface StateAtom {
  readonly mapNumber: number;
  readonly element: string;
  /** Implicit hydrogens (those not drawn as mapped atoms). */
  readonly hydrogenCount: number;
  /** Lone-pair electrons plus any unpaired electron. */
  readonly nonbondingElectronCount: number;
}

/**
 * A stereocentre's SMILES mark with its neighbours in canonical order (item 12a): an implicit H or
 * lone pair first, then the mapped neighbours by ascending map number. "@": seen from the first,
 * the others run anticlockwise; "@@": clockwise.
 */
export type TetrahedralMark = "@" | "@@";
/** A stereo double bond: its two reference neighbours (stereoMarks.ts) on one side or not. */
export type DoubleBondRelation = "cis" | "trans";

/** `bondToOrder` is keyed by bondKey(): "<smaller map number>-<larger map number>". */
export interface StateGraph {
  readonly mapNumberToAtom: ReadonlyMap<number, StateAtom>;
  readonly bondToOrder: ReadonlyMap<string, number>;
  /** Item 12a: the marked stereocentres; absent or empty when the state has no stereo. */
  readonly mapNumberToTetrahedralMark?: ReadonlyMap<number, TetrahedralMark>;
  /** Item 12a: the marked double bonds, keyed by bondKey(); absent or empty when none. */
  readonly bondToDoubleBondRelation?: ReadonlyMap<string, DoubleBondRelation>;
}

/**
 * The fixture spelling of a state graph: atoms by map number, bonds by their two map numbers; the
 * stereo lists only when the state has stereo.
 */
export interface StateGraphJson {
  readonly atoms: readonly StateAtom[];
  readonly bonds: readonly {
    readonly mapNumbers: readonly [number, number];
    readonly bondOrder: number;
  }[];
  readonly tetrahedralMarks?: readonly { mapNumber: number; mark: TetrahedralMark }[];
  readonly doubleBondStereo?: readonly {
    mapNumbers: readonly [number, number];
    relation: DoubleBondRelation;
  }[];
}

// Most valence-shell electrons: the duet for H (period 1), the octet for period 2, and an
// expanded shell (e.g. P in Ph3P=O, S in sulfones) allowed up to 12 from period 3 on.
const PERIOD_TO_MAXIMUM_VALENCE_SHELL_ELECTRONS: ReadonlyMap<number, number> = new Map([
  [1, 2],
  [2, 8],
]);
const EXPANDED_SHELL_MAXIMUM_ELECTRONS = 12;

/** The table value for `element`; the readers refuse elements outside the tables first. */
function lookUp(table: ReadonlyMap<string, number>, element: string): number {
  const value = table.get(element);
  if (value === undefined) {
    throw new Error(`no table entry for element ${element}`);
  }
  return value;
}

function atomAt(graph: StateGraph, mapNumber: number): StateAtom {
  const atom = graph.mapNumberToAtom.get(mapNumber);
  if (atom === undefined) {
    throw new Error(`the state has no atom with map number ${String(mapNumber)}`);
  }
  return atom;
}

/** The key of the bond between two atoms, e.g. bondKey(5, 3) === "3-5". */
export function bondKey(firstMapNumber: number, secondMapNumber: number): string {
  const smaller = Math.min(firstMapNumber, secondMapNumber);
  const larger = Math.max(firstMapNumber, secondMapNumber);
  return `${String(smaller)}-${String(larger)}`;
}

/** The two map numbers of a bond key, smaller first: "3-5" -> [3, 5]. */
export function bondKeyMapNumbers(key: string): [number, number] {
  const [smaller, larger] = key.split("-").map(Number);
  if (smaller === undefined || larger === undefined) {
    throw new Error(`"${key}" is not a bond key`);
  }
  return [smaller, larger];
}

/** The sum of the orders of the atom's bonds to other mapped atoms (implicit H excluded). */
export function bondOrderSum(graph: StateGraph, mapNumber: number): number {
  let orderSum = 0;
  for (const [key, order] of graph.bondToOrder) {
    if (bondKeyMapNumbers(key).includes(mapNumber)) {
      orderSum += order;
    }
  }
  return orderSum;
}

/** valence electrons - nonbonding electrons - bond orders - hydrogen count. */
export function formalCharge(graph: StateGraph, mapNumber: number): number {
  const atom = atomAt(graph, mapNumber);
  const valenceElectrons = lookUp(ELEMENT_TO_VALENCE_ELECTRONS, atom.element);
  return (
    valenceElectrons -
    atom.nonbondingElectronCount -
    bondOrderSum(graph, mapNumber) -
    atom.hydrogenCount
  );
}

export function lonePairCount(atom: StateAtom): number {
  return Math.floor(atom.nonbondingElectronCount / 2);
}

export function unpairedElectronCount(atom: StateAtom): number {
  return atom.nonbondingElectronCount % 2;
}

/** nonbonding electrons + 2 * (bond orders + hydrogen count). */
export function valenceShellElectronCount(graph: StateGraph, mapNumber: number): number {
  const atom = atomAt(graph, mapNumber);
  const sharedPairCount = bondOrderSum(graph, mapNumber) + atom.hydrogenCount;
  return atom.nonbondingElectronCount + 2 * sharedPairCount;
}

/** 2 for H, 8 for period 2, 12 from period 3 on (expanded shell, e.g. P in Ph3P=O). */
export function maximumValenceShellElectrons(element: string): number {
  const period = lookUp(ELEMENT_TO_PERIOD, element);
  return PERIOD_TO_MAXIMUM_VALENCE_SHELL_ELECTRONS.get(period) ?? EXPANDED_SHELL_MAXIMUM_ELECTRONS;
}

function compareBondMapNumbers(
  first: readonly [number, number],
  second: readonly [number, number],
): number {
  return first[0] - second[0] || first[1] - second[1];
}

export function stateGraphToJson(graph: StateGraph): StateGraphJson {
  const atoms = [...graph.mapNumberToAtom.values()]
    .sort((first, second) => first.mapNumber - second.mapNumber)
    .map((atom) => ({
      mapNumber: atom.mapNumber,
      element: atom.element,
      hydrogenCount: atom.hydrogenCount,
      nonbondingElectronCount: atom.nonbondingElectronCount,
    }));
  const bonds = [...graph.bondToOrder.entries()]
    .map(([key, bondOrder]) => ({ mapNumbers: bondKeyMapNumbers(key), bondOrder }))
    .sort((first, second) => compareBondMapNumbers(first.mapNumbers, second.mapNumbers));
  const tetrahedralMarks = [...(graph.mapNumberToTetrahedralMark ?? [])]
    .sort(([first], [second]) => first - second)
    .map(([mapNumber, mark]) => ({ mapNumber, mark }));
  const doubleBondStereo = [...(graph.bondToDoubleBondRelation ?? [])]
    .map(([key, relation]) => ({ mapNumbers: bondKeyMapNumbers(key), relation }))
    .sort((first, second) => compareBondMapNumbers(first.mapNumbers, second.mapNumbers));
  return {
    atoms,
    bonds,
    ...(tetrahedralMarks.length > 0 ? { tetrahedralMarks } : {}),
    ...(doubleBondStereo.length > 0 ? { doubleBondStereo } : {}),
  };
}

/** True when both graphs have the same atoms, electron counts and bonds. */
export function stateGraphsEqual(first: StateGraph, second: StateGraph): boolean {
  return JSON.stringify(stateGraphToJson(first)) === JSON.stringify(stateGraphToJson(second));
}
