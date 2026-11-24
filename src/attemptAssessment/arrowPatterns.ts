/**
 * Misconception arrow patterns: parse them, and match them against a learner's arrows.
 *
 * The TypeScript twin of python/attempt_assessment/arrow_patterns.py, whose docstring gives the
 * grammar and the matching rules. Both pass fixtures/assessment/arrow_pattern_cases.json.
 */
import type {
  AtomLabel,
  CurvedArrow,
  ElectronLocus,
  LocusKind,
} from "../arrowNotation/curvedArrowNotation.js";

// The arrow operators and the electrons each matches (undefined: either kind of arrow).
const OPERATOR_TO_ELECTRONS_MOVED: ReadonlyMap<string, 1 | 2 | undefined> = new Map([
  [" -> ", 2],
  [" ~> ", 1],
  [" *> ", undefined],
]);
// Locus-kind words as written, and as stored (sigma/pi are stored as their symbols).
const LOCUS_KIND_WORD_TO_STORED_WORD: ReadonlyMap<string, string> = new Map([
  ["lp", "lp"], ["rad", "rad"], ["σ", "σ"], ["sigma", "σ"], ["π", "π"], ["pi", "π"],
  ["bond", "bond"], ["*", "*"],
]); // prettier-ignore
// How many atoms each stored kind word names; "*" may name one (an atom locus) or two (a bond).
const STORED_WORD_TO_ALLOWED_ATOM_COUNTS: ReadonlyMap<string, readonly number[]> = new Map([
  ["lp", [1]], ["rad", [1]], ["σ", [2]], ["π", [2]], ["bond", [2]], ["*", [1, 2]],
]); // prettier-ignore
// Which stored kind words accept each kind of locus.
const LOCUS_KIND_TO_ACCEPTING_WORDS: Readonly<Record<LocusKind, ReadonlySet<string>>> = {
  lonePair: new Set(["lp", "*"]),
  unpairedElectron: new Set(["rad", "*"]),
  sigmaBond: new Set(["σ", "bond", "*"]),
  piBond: new Set(["π", "bond", "*"]),
};
const ATOM_SELECTOR_PATTERN =
  /^(?:(?<element>[A-Z][a-z]?)(?<mapNumber>[1-9][0-9]*|\*)|@(?<role>[a-z][A-Za-z0-9]*)|\*)$/u;
const BARE_ATOM_KIND_WORD = "atom";

type RoleTable = Readonly<Record<string, readonly number[]>>;

export type ArrowPatternErrorCode = "malformed-arrow-pattern" | "unknown-atom-role";

/** A pattern that cannot be read; `errorCode` says why. */
export class ArrowPatternError extends Error {
  readonly errorCode: ArrowPatternErrorCode;

  constructor(errorCode: ArrowPatternErrorCode, message: string) {
    super(message);
    this.name = "ArrowPatternError";
    this.errorCode = errorCode;
  }
}

/** Which atoms a selector accepts: undefined means any element / any map number. */
export interface AtomSelector {
  readonly element: string | undefined;
  readonly mapNumbers: ReadonlySet<number> | undefined;
}

/**
 * `locusKindWord` is lp, rad, σ, π, bond or * (sigma/pi are stored as σ/π), or "atom" for a bare
 * atom destination. `atomSelectors` is empty for a lone "*".
 */
export interface LocusPattern {
  readonly locusKindWord: string;
  readonly atomSelectors: readonly AtomSelector[];
}

/** `electronsMoved` is 2 for "->", 1 for "~>", undefined for "*>". */
export interface SingleArrowPattern {
  readonly source: LocusPattern;
  readonly destination: LocusPattern;
  readonly electronsMoved: 1 | 2 | undefined;
}

export interface ArrowPattern {
  readonly singleArrowPatterns: readonly SingleArrowPattern[];
}

function malformed(detail: string, wholePattern: string): ArrowPatternError {
  return new ArrowPatternError("malformed-arrow-pattern", `"${wholePattern}": ${detail}`);
}

function parseAtomSelector(text: string, roles: RoleTable, wholePattern: string): AtomSelector {
  const groups = ATOM_SELECTOR_PATTERN.exec(text)?.groups;
  if (groups === undefined) {
    throw malformed(`"${text}" is not O1, O*, @role or *`, wholePattern);
  }
  if (groups.role !== undefined) {
    const mapNumbers = roles[groups.role];
    if (mapNumbers === undefined) {
      throw new ArrowPatternError(
        "unknown-atom-role",
        `"${wholePattern}": role @${groups.role} is not in atomRoleToMapNumbers`,
      );
    }
    return { element: undefined, mapNumbers: new Set(mapNumbers) };
  }
  if (groups.element === undefined) {
    return { element: undefined, mapNumbers: undefined };
  }
  const mapNumbers = groups.mapNumber === "*" ? undefined : new Set([Number(groups.mapNumber)]);
  return { element: groups.element, mapNumbers };
}

/** A locus pattern; a destination may also be a bare atom selector. */
function parseLocusPattern(
  text: string,
  roles: RoleTable,
  wholePattern: string,
  isDestination: boolean,
): LocusPattern {
  if (text === "*") {
    return { locusKindWord: "*", atomSelectors: [] };
  }
  const words = text.split(" ");
  const [firstWord = "", secondWord] = words;
  if (words.length === 1 && isDestination) {
    return {
      locusKindWord: BARE_ATOM_KIND_WORD,
      atomSelectors: [parseAtomSelector(firstWord, roles, wholePattern)],
    };
  }
  const storedWord = words.length === 2 ? LOCUS_KIND_WORD_TO_STORED_WORD.get(firstWord) : undefined;
  const selectorTexts = storedWord === undefined ? [] : (secondWord ?? "").split("-");
  const allowedCounts =
    storedWord === undefined ? [] : (STORED_WORD_TO_ALLOWED_ATOM_COUNTS.get(storedWord) ?? []);
  if (storedWord === undefined || !allowedCounts.includes(selectorTexts.length)) {
    throw malformed(
      `"${text}" is not a locus pattern such as "lp O1" or "bond C2-Br3"`,
      wholePattern,
    );
  }
  return {
    locusKindWord: storedWord,
    atomSelectors: selectorTexts.map((selectorText) =>
      parseAtomSelector(selectorText, roles, wholePattern),
    ),
  };
}

function parseSingleArrowPattern(
  text: string,
  roles: RoleTable,
  wholePattern: string,
): SingleArrowPattern {
  const operatorsFound = [...OPERATOR_TO_ELECTRONS_MOVED.keys()].flatMap((operator) =>
    Array<string>(text.split(operator).length - 1).fill(operator),
  );
  const [operator] = operatorsFound;
  if (operator === undefined || operatorsFound.length !== 1) {
    throw malformed(`"${text}" needs exactly one of " -> ", " ~> ", " *> "`, wholePattern);
  }
  const [sourceText = "", destinationText = ""] = text.split(operator);
  return {
    source: parseLocusPattern(sourceText, roles, wholePattern, false),
    destination: parseLocusPattern(destinationText, roles, wholePattern, true),
    electronsMoved: OPERATOR_TO_ELECTRONS_MOVED.get(operator),
  };
}

/** Parse one misconception's arrowPattern. Throws ArrowPatternError. */
export function parseArrowPattern(
  patternText: string,
  atomRoleToMapNumbers: Readonly<Record<string, readonly number[]>>,
): ArrowPattern {
  const singleTexts = patternText.split(";").map((part) => part.trim());
  if (singleTexts.some((singleText) => singleText === "")) {
    throw malformed("an arrow pattern is empty", patternText);
  }
  return {
    singleArrowPatterns: singleTexts.map((singleText) =>
      parseSingleArrowPattern(singleText, atomRoleToMapNumbers, patternText),
    ),
  };
}

function selectorAccepts(selector: AtomSelector | undefined, atom: AtomLabel): boolean {
  if (selector === undefined) {
    return false;
  }
  const elementFits = selector.element === undefined || selector.element === atom.element;
  const mapNumberFits =
    selector.mapNumbers === undefined || selector.mapNumbers.has(atom.mapNumber);
  return elementFits && mapNumberFits;
}

function locusMatches(locusPattern: LocusPattern, locus: ElectronLocus): boolean {
  const selectors = locusPattern.atomSelectors;
  if (locusPattern.locusKindWord === "*" && selectors.length === 0) {
    return true;
  }
  if (
    !LOCUS_KIND_TO_ACCEPTING_WORDS[locus.locusKind].has(locusPattern.locusKindWord) ||
    selectors.length !== locus.atoms.length
  ) {
    return false;
  }
  const [firstSelector, secondSelector] = selectors;
  if (locus.atoms.length === 1) {
    return selectorAccepts(firstSelector, locus.atoms[0]);
  }
  const [firstAtom, secondAtom] = locus.atoms;
  const inOrder =
    selectorAccepts(firstSelector, firstAtom) && selectorAccepts(secondSelector, secondAtom);
  const swapped =
    selectorAccepts(firstSelector, secondAtom) && selectorAccepts(secondSelector, firstAtom);
  return inOrder || swapped;
}

/** A bare atom destination: electrons end on that atom, or bond to it from another atom. */
function destinationMatches(destinationPattern: LocusPattern, curvedArrow: CurvedArrow): boolean {
  const { destination } = curvedArrow;
  if (destinationPattern.locusKindWord !== BARE_ATOM_KIND_WORD) {
    return locusMatches(destinationPattern, destination);
  }
  const [selector] = destinationPattern.atomSelectors;
  if (destination.atoms.length === 1) {
    return selectorAccepts(selector, destination.atoms[0]);
  }
  const sourceMapNumbers = new Set(curvedArrow.source.atoms.map((atom) => atom.mapNumber));
  return destination.atoms.some(
    (atom) => selectorAccepts(selector, atom) && !sourceMapNumbers.has(atom.mapNumber),
  );
}

function singleArrowPatternMatches(
  singleArrowPattern: SingleArrowPattern,
  curvedArrow: CurvedArrow,
): boolean {
  const electronsFit =
    singleArrowPattern.electronsMoved === undefined ||
    singleArrowPattern.electronsMoved === curvedArrow.electronsMoved;
  return (
    electronsFit &&
    locusMatches(singleArrowPattern.source, curvedArrow.source) &&
    destinationMatches(singleArrowPattern.destination, curvedArrow)
  );
}

/** True when every single-arrow pattern is matched by some arrow in `curvedArrows`. */
export function arrowPatternMatches(
  arrowPattern: ArrowPattern,
  curvedArrows: readonly CurvedArrow[],
): boolean {
  return arrowPattern.singleArrowPatterns.every((singleArrowPattern) =>
    curvedArrows.some((curvedArrow) => singleArrowPatternMatches(singleArrowPattern, curvedArrow)),
  );
}
