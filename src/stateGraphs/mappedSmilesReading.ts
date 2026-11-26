/**
 * Read a state's mapped SMILES into a StateGraph, with a strict parser of our own.
 *
 * Decided 2026-11-24 (SPEC §5): the browser does not load RDKit.js; it reads only the strict
 * SMILES subset that reaction files use, and refuses anything else. The shared cases in
 * fixtures/state_graphs/mapped_smiles_cases.json fix the graphs it gives, and
 * chemistryToolkit/strictReaderAgreement.test.ts checks this reader against RDKit.
 *
 * Accepted SMILES (the strict subset used by reaction files)
 *   every atom in brackets with a map number ([CH3:2], [H:4], [O-:1]); Kekulé bonds (-, =, #);
 *   branches, ring closures and "." between molecules. Bond orders and hydrogen counts are taken
 *   exactly as written (a Kekulé ring is not re-perceived as aromatic). Since item 12a also stereo
 *   marks: "@" and "@@" on a stereocentre, "/" and "\" on single bonds next to a double bond (not
 *   on ring closures); the graph keeps them on map numbers (stereoMarks.ts).
 *
 * Error codes (MappedSmilesError.errorCode)
 *   malformed-smiles            not readable SMILES (or empty)
 *   unmapped-atom               an atom has no map number (including atoms without brackets)
 *   aromatic-notation           lower-case aromatic atoms or ":" aromatic bonds
 *   unsupported-smiles-feature  isotopes, "@@@" and longer, "/" or "\" on a ring closure, "*"
 *                               atoms, "$" bonds
 *   duplicate-map-number        one map number used for two atoms
 *   unsupported-element         an element without an entry in ELEMENT_TO_VALENCE_ELECTRONS
 *   impossible-electron-count   more bonds, hydrogens and charge than valence electrons allow
 *   invalid-stereo-mark         "@" on an atom without four neighbours (an implicit H or a lone
 *                               pair counting as one), two neighbours marked on one side of a
 *                               double bond, or a "/" or "\" next to no double bond marked at
 *                               both ends
 */
import {
  bondKey,
  bondOrderSum,
  ELEMENT_TO_VALENCE_ELECTRONS,
  type StateAtom,
  type StateGraph,
  type TetrahedralMark,
} from "./stateGraph.js";
import {
  canonicalNeighbourOrder,
  type DirectedBond,
  type DirectionSymbol,
  hasImplicitNeighbour,
  IMPLICIT_NEIGHBOUR,
  markInOrder,
  relationsFromDirections,
} from "./stereoMarks.js";

export type MappedSmilesErrorCode =
  | "malformed-smiles"
  | "unmapped-atom"
  | "aromatic-notation"
  | "unsupported-smiles-feature"
  | "duplicate-map-number"
  | "unsupported-element"
  | "impossible-electron-count"
  | "invalid-stereo-mark";

/** Mapped SMILES that cannot be read into a state graph; `errorCode` says why. */
export class MappedSmilesError extends Error {
  readonly errorCode: MappedSmilesErrorCode;

  constructor(errorCode: MappedSmilesErrorCode, message: string) {
    super(message);
    this.name = "MappedSmilesError";
    this.errorCode = errorCode;
  }
}

/** One bracket atom as written: its formal charge is kept until bonds are known. */
interface WrittenAtom {
  readonly mapNumber: number;
  readonly element: string;
  readonly hydrogenCount: number;
  readonly formalCharge: number;
  readonly mark: TetrahedralMark | undefined;
}

/** A ring-closure digit seen once: the atom it opened at, and a bond symbol written there. */
interface OpenRingClosure {
  readonly mapNumber: number;
  readonly bondOrder: number | undefined;
  /** Where the closing atom goes in the opening atom's written neighbours. */
  readonly neighbourIndex: number;
}

/** Everything the reader tracks while it walks the SMILES from left to right. */
interface ReadingProgress {
  readonly mappedSmiles: string;
  position: number;
  /** The atom the next atom or ring closure bonds to; undefined at the start and after ".". */
  previousMapNumber: number | undefined;
  /** A bond symbol (-, =, #) waiting for the atom or ring closure that follows it. */
  pendingBondOrder: number | undefined;
  /** A "/" or "\\" waiting, like pendingBondOrder (whose order is then 1). */
  pendingDirection: DirectionSymbol | undefined;
  /** The atom each open "(" branches from, innermost last. */
  readonly branchStartMapNumbers: (number | undefined)[];
  readonly ringLabelToOpening: Map<string, OpenRingClosure>;
  readonly mapNumberToWrittenAtom: Map<number, WrittenAtom>;
  readonly bondToOrder: Map<string, number>;
  /** Each atom's neighbours in the order written, IMPLICIT_NEIGHBOUR after the preceding atom. */
  readonly mapNumberToWrittenNeighbours: Map<number, number[]>;
  readonly directedBonds: DirectedBond[];
}

const BOND_SYMBOL_TO_ORDER: ReadonlyMap<string, number> = new Map([
  ["-", 1],
  ["=", 2],
  ["#", 3],
]);
// ":" is an aromatic bond; "$" is a quadruple bond.
const AROMATIC_BOND_SYMBOL = ":";
const UNSUPPORTED_BOND_SYMBOLS = new Set(["$"]);
const DIRECTION_SYMBOLS: ReadonlySet<string> = new Set(["/", "\\"]);
const LONGEST_MARK = 2;
const STEREOCENTRE_NEIGHBOURS = 4;
// A placeholder in a written-neighbour list until its ring closes (map numbers start at 1).
const RING_PLACEHOLDER = -1;
// [isotope] symbol [@ marks] [H count] [charge] [:map number]
const BRACKET_ATOM_PATTERN =
  /^(?<isotope>[0-9]+)?(?<symbol>\*|[A-Z][a-z]?|[a-z][a-z]?)(?<chirality>@+)?(?<hydrogens>H[0-9]*)?(?<charge>\+\+|--|[+-][0-9]*)?(?::(?<mapNumber>[0-9]+))?$/u;
const RING_CLOSURE_PATTERN = /^(?:[0-9]|%[0-9]{2})/u;

function refuse(
  errorCode: MappedSmilesErrorCode,
  detail: string,
  progress: ReadingProgress,
): never {
  throw new MappedSmilesError(errorCode, `"${progress.mappedSmiles}": ${detail}`);
}

/** The formal charge written in a bracket: "+" -> 1, "--" -> -2, "-2" -> -2, none -> 0. */
function chargeValue(chargeText: string | undefined): number {
  if (chargeText === undefined) {
    return 0;
  }
  const sign = chargeText.startsWith("+") ? 1 : -1;
  // "++" and "--" repeat the sign; otherwise a number may follow it ("+" alone means 1).
  const isRepeatedSign = chargeText === "++" || chargeText === "--";
  const magnitude = isRepeatedSign ? 2 : Number(chargeText.slice(1) || "1");
  return sign * magnitude;
}

/**
 * The first problem with a matched bracket atom, checked in this order:
 * isotope, "*" or "@" marks; aromatic (lower-case) symbol; no map number; unknown element.
 */
function bracketAtomProblem(
  groups: Record<string, string | undefined>,
  symbol: string,
): [MappedSmilesErrorCode, string] | undefined {
  const isLongMark = (groups.chirality?.length ?? 0) > LONGEST_MARK;
  if (groups.isotope !== undefined || symbol === "*" || isLongMark) {
    return ["unsupported-smiles-feature", 'isotopes, "*" and "@@@" are not used'];
  }
  if (symbol === symbol.toLowerCase()) {
    return ["aromatic-notation", "aromatic atom; write the Kekulé form"];
  }
  if (groups.mapNumber === undefined || Number(groups.mapNumber) === 0) {
    return ["unmapped-atom", "no map number"];
  }
  if (!ELEMENT_TO_VALENCE_ELECTRONS.has(symbol)) {
    return ["unsupported-element", `element ${symbol} is not supported`];
  }
  return undefined;
}

/** The atom in "[...]", or a refusal naming the first problem. */
function writtenAtomFromBracket(content: string, progress: ReadingProgress): WrittenAtom {
  const groups = BRACKET_ATOM_PATTERN.exec(content)?.groups;
  const symbol = groups?.symbol;
  if (groups === undefined || symbol === undefined) {
    return refuse("malformed-smiles", `"[${content}]" is not a bracket atom`, progress);
  }
  const problem = bracketAtomProblem(groups, symbol);
  if (problem !== undefined) {
    const [errorCode, detail] = problem;
    return refuse(errorCode, `"[${content}]": ${detail}`, progress);
  }
  const hydrogenText = groups.hydrogens;
  const hydrogenCount = hydrogenText === undefined ? 0 : Number(hydrogenText.slice(1) || "1");
  return {
    mapNumber: Number(groups.mapNumber),
    element: symbol,
    hydrogenCount,
    formalCharge: chargeValue(groups.charge),
    mark: groups.chirality === undefined ? undefined : (groups.chirality as TetrahedralMark),
  };
}

function writtenNeighboursOf(mapNumber: number, progress: ReadingProgress): number[] {
  const neighbours = progress.mapNumberToWrittenNeighbours.get(mapNumber) ?? [];
  progress.mapNumberToWrittenNeighbours.set(mapNumber, neighbours);
  return neighbours;
}

function addBond(
  firstMapNumber: number,
  secondMapNumber: number,
  bondOrder: number,
  progress: ReadingProgress,
): void {
  progress.bondToOrder.set(bondKey(firstMapNumber, secondMapNumber), bondOrder);
}

/** "[...]": add the atom, bonded to the previous atom if there is one. */
function readBracketAtom(progress: ReadingProgress): void {
  const closingPosition = progress.mappedSmiles.indexOf("]", progress.position);
  if (closingPosition < 0) {
    refuse("malformed-smiles", "a bracket is not closed", progress);
  }
  const writtenAtom = writtenAtomFromBracket(
    progress.mappedSmiles.slice(progress.position + 1, closingPosition),
    progress,
  );
  if (progress.mapNumberToWrittenAtom.has(writtenAtom.mapNumber)) {
    refuse(
      "duplicate-map-number",
      `map number ${String(writtenAtom.mapNumber)} is used twice`,
      progress,
    );
  }
  progress.mapNumberToWrittenAtom.set(writtenAtom.mapNumber, writtenAtom);
  const neighbours = writtenNeighboursOf(writtenAtom.mapNumber, progress);
  const previous = progress.previousMapNumber;
  if (previous !== undefined) {
    addBond(previous, writtenAtom.mapNumber, progress.pendingBondOrder ?? 1, progress);
    neighbours.push(previous);
    writtenNeighboursOf(previous, progress).push(writtenAtom.mapNumber);
    if (progress.pendingDirection !== undefined) {
      const symbol = progress.pendingDirection;
      progress.directedBonds.push({ left: previous, right: writtenAtom.mapNumber, symbol });
    }
  }
  if (writtenAtom.mark !== undefined) {
    neighbours.push(IMPLICIT_NEIGHBOUR);
  }
  progress.previousMapNumber = writtenAtom.mapNumber;
  progress.pendingBondOrder = undefined;
  progress.pendingDirection = undefined;
  progress.position = closingPosition + 1;
}

/** A ring-closure label: open it, or close it with a bond back to where it was opened. */
function readRingClosure(label: string, progress: ReadingProgress): void {
  const currentMapNumber = progress.previousMapNumber;
  if (currentMapNumber === undefined) {
    refuse("malformed-smiles", `ring closure ${label} does not follow an atom`, progress);
  }
  if (progress.pendingDirection !== undefined) {
    refuse("unsupported-smiles-feature", `"/" or "\\" on ring closure ${label}`, progress);
  }
  const opening = progress.ringLabelToOpening.get(label);
  const neighbours = writtenNeighboursOf(currentMapNumber, progress);
  if (opening === undefined) {
    progress.ringLabelToOpening.set(label, {
      mapNumber: currentMapNumber,
      bondOrder: progress.pendingBondOrder,
      neighbourIndex: neighbours.length,
    });
    neighbours.push(RING_PLACEHOLDER);
  } else {
    neighbours.push(opening.mapNumber);
    writtenNeighboursOf(opening.mapNumber, progress)[opening.neighbourIndex] = currentMapNumber;
    const bothWritten = opening.bondOrder !== undefined && progress.pendingBondOrder !== undefined;
    if (bothWritten && opening.bondOrder !== progress.pendingBondOrder) {
      refuse("malformed-smiles", `ring closure ${label} has two different bond symbols`, progress);
    }
    addBond(
      opening.mapNumber,
      currentMapNumber,
      progress.pendingBondOrder ?? opening.bondOrder ?? 1,
      progress,
    );
    progress.ringLabelToOpening.delete(label);
  }
  progress.pendingBondOrder = undefined;
  progress.position += label.length;
}

/** "(", ")" and ".": where the next atom attaches. */
function readBranchOrDot(character: string, progress: ReadingProgress): void {
  if (progress.pendingBondOrder !== undefined && character !== "(") {
    refuse("malformed-smiles", `a bond symbol is followed by "${character}"`, progress);
  }
  if (character === "(") {
    if (progress.previousMapNumber === undefined) {
      refuse("malformed-smiles", "a branch does not follow an atom", progress);
    }
    progress.branchStartMapNumbers.push(progress.previousMapNumber);
  } else if (character === ")") {
    if (progress.branchStartMapNumbers.length === 0) {
      refuse("malformed-smiles", 'a ")" has no matching "("', progress);
    }
    progress.previousMapNumber = progress.branchStartMapNumbers.pop();
  } else {
    progress.previousMapNumber = undefined;
  }
  progress.position += 1;
}

/** "-", "=", "#", "/", "\\": remember the order (and direction) for what follows. */
function readBondSymbol(
  bondOrder: number,
  progress: ReadingProgress,
  direction?: DirectionSymbol,
): void {
  if (progress.previousMapNumber === undefined || progress.pendingBondOrder !== undefined) {
    refuse("malformed-smiles", "a bond symbol is not between two atoms", progress);
  }
  progress.pendingBondOrder = bondOrder;
  progress.pendingDirection = direction;
  progress.position += 1;
}

/** A character that the strict subset does not allow here. */
function refuseCharacter(character: string, progress: ReadingProgress): never {
  if (character === AROMATIC_BOND_SYMBOL || /^[a-z]$/u.test(character)) {
    return refuse(
      "aromatic-notation",
      `"${character}" is aromatic notation; write the Kekulé form`,
      progress,
    );
  }
  if (UNSUPPORTED_BOND_SYMBOLS.has(character) || character === "*") {
    return refuse(
      "unsupported-smiles-feature",
      `"${character}" is not used in reaction files`,
      progress,
    );
  }
  if (/^[A-Z]$/u.test(character)) {
    return refuse(
      "unmapped-atom",
      `"${character}" is an atom without brackets or a map number`,
      progress,
    );
  }
  return refuse(
    "malformed-smiles",
    `unexpected "${character}" at position ${String(progress.position)}`,
    progress,
  );
}

/** Read the token at the current position and move past it. */
function readNextToken(progress: ReadingProgress): void {
  const rest = progress.mappedSmiles.slice(progress.position);
  const character = rest.charAt(0);
  const bondOrder = BOND_SYMBOL_TO_ORDER.get(character);
  const ringClosureLabel = RING_CLOSURE_PATTERN.exec(rest)?.[0];
  if (character === "[") {
    readBracketAtom(progress);
  } else if ("().".includes(character)) {
    readBranchOrDot(character, progress);
  } else if (bondOrder !== undefined) {
    readBondSymbol(bondOrder, progress);
  } else if (DIRECTION_SYMBOLS.has(character)) {
    readBondSymbol(1, progress, character as DirectionSymbol);
  } else if (ringClosureLabel !== undefined) {
    readRingClosure(ringClosureLabel, progress);
  } else {
    refuseCharacter(character, progress);
  }
}

/**
 * Each atom with its nonbonding electrons worked out as valence electrons - formal charge -
 * bond orders - hydrogen count (all bonds are known once the whole SMILES has been read).
 */
function stateAtomsOf(progress: ReadingProgress): Map<number, StateAtom> {
  // bondOrderSum needs only the bonds, so the atoms can be left out here.
  const bondsOnly: StateGraph = { mapNumberToAtom: new Map(), bondToOrder: progress.bondToOrder };
  const mapNumberToAtom = new Map<number, StateAtom>();
  for (const {
    mapNumber,
    element,
    hydrogenCount,
    formalCharge,
  } of progress.mapNumberToWrittenAtom.values()) {
    // The element was checked against this table when its bracket was read.
    const valenceElectrons = ELEMENT_TO_VALENCE_ELECTRONS.get(element) ?? 0;
    const nonbondingElectronCount =
      valenceElectrons - formalCharge - bondOrderSum(bondsOnly, mapNumber) - hydrogenCount;
    if (nonbondingElectronCount < 0) {
      refuse(
        "impossible-electron-count",
        `atom ${element}${String(mapNumber)} has more bonds, hydrogens and charge ` +
          "than valence electrons",
        progress,
      );
    }
    mapNumberToAtom.set(mapNumber, { mapNumber, element, hydrogenCount, nonbondingElectronCount });
  }
  return mapNumberToAtom;
}

/** Each marked stereocentre's mark for the canonical neighbour order (stereoMarks.ts). */
function tetrahedralMarksOf(
  progress: ReadingProgress,
  mapNumberToAtom: ReadonlyMap<number, StateAtom>,
): Map<number, TetrahedralMark> {
  const marks = new Map<number, TetrahedralMark>();
  for (const { mapNumber, mark } of progress.mapNumberToWrittenAtom.values()) {
    const atom = mapNumberToAtom.get(mapNumber);
    if (mark === undefined || atom === undefined) {
      continue;
    }
    const written = writtenNeighboursOf(mapNumber, progress);
    const mapped = written.filter((neighbour) => neighbour !== IMPLICIT_NEIGHBOUR);
    const order = hasImplicitNeighbour(atom, mapped.length) ? written : mapped;
    if (order.length !== STEREOCENTRE_NEIGHBOURS || atom.hydrogenCount > 1) {
      refuse("invalid-stereo-mark", `atom ${String(mapNumber)} is not a stereocentre`, progress);
    }
    marks.set(mapNumber, markInOrder(mark, order, canonicalNeighbourOrder(order)));
  }
  return marks;
}

/** The state graph of one mapped SMILES. Throws MappedSmilesError. */
export function stateGraphFromMappedSmiles(mappedSmiles: string): StateGraph {
  const progress: ReadingProgress = {
    mappedSmiles,
    position: 0,
    previousMapNumber: undefined,
    pendingBondOrder: undefined,
    pendingDirection: undefined,
    branchStartMapNumbers: [],
    ringLabelToOpening: new Map(),
    mapNumberToWrittenAtom: new Map(),
    bondToOrder: new Map(),
    mapNumberToWrittenNeighbours: new Map(),
    directedBonds: [],
  };
  while (progress.position < mappedSmiles.length) {
    readNextToken(progress);
  }
  const isUnfinished =
    progress.pendingBondOrder !== undefined ||
    progress.branchStartMapNumbers.length > 0 ||
    progress.ringLabelToOpening.size > 0;
  if (mappedSmiles === "" || isUnfinished) {
    refuse("malformed-smiles", "empty, or a bond, branch or ring is left open", progress);
  }
  const mapNumberToAtom = stateAtomsOf(progress);
  const relations = relationsFromDirections(progress.bondToOrder, progress.directedBonds);
  if (typeof relations === "string") {
    refuse("invalid-stereo-mark", relations, progress);
  }
  return {
    mapNumberToAtom,
    bondToOrder: progress.bondToOrder,
    mapNumberToTetrahedralMark: tetrahedralMarksOf(progress, mapNumberToAtom),
    bondToDoubleBondRelation: relations,
  };
}
