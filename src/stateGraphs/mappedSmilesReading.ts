/**
 * Read a state's mapped SMILES into a StateGraph, with a strict parser of our own.
 *
 * Decided 2026-11-24 (SPEC section 5): the browser does not load RDKit.js; it reads only the
 * strict SMILES subset that reaction files use, and refuses anything else. The Python twin
 * (python/state_graphs/mapped_smiles_reading.py) reads the same cases with real RDKit, so the
 * shared fixtures (fixtures/state_graphs/mapped_smiles_cases.json) check this parser against it.
 * The accepted subset and the error codes are listed in that Python module's docstring.
 */
import {
  bondKey,
  bondOrderSum,
  ELEMENT_TO_VALENCE_ELECTRONS,
  type StateAtom,
  type StateGraph,
} from "./stateGraph.js";

export type MappedSmilesErrorCode =
  | "malformed-smiles"
  | "unmapped-atom"
  | "aromatic-notation"
  | "unsupported-smiles-feature"
  | "duplicate-map-number"
  | "unsupported-element"
  | "impossible-electron-count";

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
}

/** A ring-closure digit seen once: the atom it opened at, and a bond symbol written there. */
interface OpenRingClosure {
  readonly mapNumber: number;
  readonly bondOrder: number | undefined;
}

/** Everything the reader tracks while it walks the SMILES from left to right. */
interface ReadingProgress {
  readonly mappedSmiles: string;
  position: number;
  /** The atom the next atom or ring closure bonds to; undefined at the start and after ".". */
  previousMapNumber: number | undefined;
  /** A bond symbol (-, =, #) waiting for the atom or ring closure that follows it. */
  pendingBondOrder: number | undefined;
  /** The atom each open "(" branches from, innermost last. */
  readonly branchStartMapNumbers: (number | undefined)[];
  readonly ringLabelToOpening: Map<string, OpenRingClosure>;
  readonly mapNumberToWrittenAtom: Map<number, WrittenAtom>;
  readonly bondToOrder: Map<string, number>;
}

const BOND_SYMBOL_TO_ORDER: ReadonlyMap<string, number> = new Map([
  ["-", 1],
  ["=", 2],
  ["#", 3],
]);
// ":" is an aromatic bond; "/" and "\" mark double-bond stereo; "$" is a quadruple bond.
const AROMATIC_BOND_SYMBOL = ":";
const UNSUPPORTED_BOND_SYMBOLS = new Set(["/", "\\", "$"]);
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
 * The first problem with a matched bracket atom, checked in the same order as the Python twin:
 * isotope, "*" or "@" marks; aromatic (lower-case) symbol; no map number; unknown element.
 */
function bracketAtomProblem(
  groups: Record<string, string | undefined>,
  symbol: string,
): [MappedSmilesErrorCode, string] | undefined {
  if (groups.isotope !== undefined || symbol === "*" || groups.chirality !== undefined) {
    return ["unsupported-smiles-feature", 'isotopes, "*" and "@" are not used'];
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
  };
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
  if (progress.previousMapNumber !== undefined) {
    addBond(
      progress.previousMapNumber,
      writtenAtom.mapNumber,
      progress.pendingBondOrder ?? 1,
      progress,
    );
  }
  progress.previousMapNumber = writtenAtom.mapNumber;
  progress.pendingBondOrder = undefined;
  progress.position = closingPosition + 1;
}

/** A ring-closure label: open it, or close it with a bond back to where it was opened. */
function readRingClosure(label: string, progress: ReadingProgress): void {
  const currentMapNumber = progress.previousMapNumber;
  if (currentMapNumber === undefined) {
    refuse("malformed-smiles", `ring closure ${label} does not follow an atom`, progress);
  }
  const opening = progress.ringLabelToOpening.get(label);
  if (opening === undefined) {
    progress.ringLabelToOpening.set(label, {
      mapNumber: currentMapNumber,
      bondOrder: progress.pendingBondOrder,
    });
  } else {
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

/** "-", "=", "#": remember the order for the next atom or ring closure. */
function readBondSymbol(bondOrder: number, progress: ReadingProgress): void {
  if (progress.previousMapNumber === undefined || progress.pendingBondOrder !== undefined) {
    refuse("malformed-smiles", "a bond symbol is not between two atoms", progress);
  }
  progress.pendingBondOrder = bondOrder;
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

/** The state graph of one mapped SMILES. Throws MappedSmilesError. */
export function stateGraphFromMappedSmiles(mappedSmiles: string): StateGraph {
  const progress: ReadingProgress = {
    mappedSmiles,
    position: 0,
    previousMapNumber: undefined,
    pendingBondOrder: undefined,
    branchStartMapNumbers: [],
    ringLabelToOpening: new Map(),
    mapNumberToWrittenAtom: new Map(),
    bondToOrder: new Map(),
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
  return { mapNumberToAtom: stateAtomsOf(progress), bondToOrder: progress.bondToOrder };
}
