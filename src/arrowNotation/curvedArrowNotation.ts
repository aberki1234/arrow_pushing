/**
 * Parse and print the curved-arrow notation, e.g. "lp O1 -> σ O1-C2".
 *
 * The TypeScript twin of python/arrow_notation/curved_arrow_notation.py; both pass the shared
 * cases in fixtures/notation/curved_arrows.json. Terms, the printed form and the error codes (and
 * the order they are checked in) are described in that Python module's docstring.
 */

export type LocusKind = "lonePair" | "unpairedElectron" | "sigmaBond" | "piBond";

export interface AtomLabel {
  readonly element: string;
  readonly mapNumber: number;
}

/** A lone pair or unpaired electron sits on one atom. */
export interface AtomLocus {
  readonly locusKind: "lonePair" | "unpairedElectron";
  readonly atoms: readonly [AtomLabel];
}

/** A bond joins two atoms, held in ascending map-number order. */
export interface BondLocus {
  readonly locusKind: "sigmaBond" | "piBond";
  readonly atoms: readonly [AtomLabel, AtomLabel];
}

export type ElectronLocus = AtomLocus | BondLocus;

/** `electronsMoved` is 2 for a pair arrow (->) and 1 for a fish-hook (~>). */
export interface CurvedArrow {
  readonly source: ElectronLocus;
  readonly destination: ElectronLocus;
  readonly electronsMoved: 1 | 2;
}

export type ArrowNotationErrorCode =
  | "malformed-arrow"
  | "malformed-locus"
  | "malformed-atom-label"
  | "conflicting-atom-labels"
  | "bond-to-same-atom"
  | "arrow-to-itself"
  | "unpaired-electron-in-pair-arrow";

/** Notation that cannot be read; `errorCode` says why. */
export class ArrowNotationError extends Error {
  readonly errorCode: ArrowNotationErrorCode;

  constructor(errorCode: ArrowNotationErrorCode, message: string) {
    super(message);
    this.name = "ArrowNotationError";
    this.errorCode = errorCode;
  }
}

// The two arrow operators: a pair arrow moves 2 electrons, a fish-hook 1.
const PAIR_ARROW_OPERATOR = " -> ";
const FISH_HOOK_OPERATOR = " ~> ";

// The words a locus may start with, and the word each kind is printed with.
const LOCUS_WORD_TO_KIND: ReadonlyMap<string, LocusKind> = new Map<string, LocusKind>([
  ["lp", "lonePair"],
  ["rad", "unpairedElectron"],
  ["σ", "sigmaBond"],
  ["sigma", "sigmaBond"],
  ["π", "piBond"],
  ["pi", "piBond"],
]);
const LOCUS_KIND_TO_PRINTED_WORD: Readonly<Record<LocusKind, string>> = {
  lonePair: "lp",
  unpairedElectron: "rad",
  sigmaBond: "σ",
  piBond: "π",
};

// A locus is a word, one space, then one atom label, or two joined by "-". Atom labels are only
// roughly matched here ([^\s-]+), so that a bad label gets its own error code.
const LOCUS_PATTERN = /^(?<locusWord>lp|rad|σ|sigma|π|pi) (?<atomLabels>[^\s-]+(?:-[^\s-]+)?)$/u;
const ATOM_LABEL_PATTERN = /^(?<element>[A-Z][a-z]?)(?<mapNumber>[1-9][0-9]*)$/u;

function isBondKind(locusKind: LocusKind): locusKind is BondLocus["locusKind"] {
  return locusKind === "sigmaBond" || locusKind === "piBond";
}

/** "Cl12" -> { element: "Cl", mapNumber: 12 }. The map number has no leading zero. */
function parseAtomLabel(label: string, wholeNotation: string): AtomLabel {
  const labelGroups = ATOM_LABEL_PATTERN.exec(label)?.groups;
  if (labelGroups?.element === undefined || labelGroups.mapNumber === undefined) {
    throw new ArrowNotationError(
      "malformed-atom-label",
      `"${label}" in "${wholeNotation}" is not an element followed by a map number, e.g. O1`,
    );
  }
  return { element: labelGroups.element, mapNumber: Number(labelGroups.mapNumber) };
}

/** Throw conflicting-atom-labels if one map number appears with two elements. */
function checkAtomLabelsAgree(atoms: readonly AtomLabel[], wholeNotation: string): void {
  const mapNumberToElement = new Map<number, string>();
  for (const atom of atoms) {
    const knownElement = mapNumberToElement.get(atom.mapNumber) ?? atom.element;
    if (knownElement !== atom.element) {
      throw new ArrowNotationError(
        "conflicting-atom-labels",
        `map number ${String(atom.mapNumber)} is both ${knownElement} and ${atom.element} ` +
          `in "${wholeNotation}"`,
      );
    }
    mapNumberToElement.set(atom.mapNumber, atom.element);
  }
}

function malformedLocus(notation: string, wholeNotation: string): ArrowNotationError {
  return new ArrowNotationError(
    "malformed-locus",
    `"${notation}" in "${wholeNotation}" is not "lp X", "rad X", "σ X-Y" or "π X-Y"`,
  );
}

/** A bond locus with its two atoms in ascending map-number order. */
function bondLocus(
  locusKind: BondLocus["locusKind"],
  atoms: readonly AtomLabel[],
  notation: string,
  wholeNotation: string,
): BondLocus {
  const [firstAtom, secondAtom] = atoms;
  if (firstAtom === undefined || secondAtom === undefined) {
    throw malformedLocus(notation, wholeNotation);
  }
  if (firstAtom.mapNumber === secondAtom.mapNumber) {
    throw new ArrowNotationError(
      "bond-to-same-atom",
      `the bond "${notation}" in "${wholeNotation}" joins an atom to itself`,
    );
  }
  const atomsInOrder: readonly [AtomLabel, AtomLabel] =
    firstAtom.mapNumber < secondAtom.mapNumber ? [firstAtom, secondAtom] : [secondAtom, firstAtom];
  return { locusKind, atoms: atomsInOrder };
}

/** Parse one locus; `wholeNotation` is quoted in error messages. */
function parseLocus(notation: string, wholeNotation: string): ElectronLocus {
  const locusGroups = LOCUS_PATTERN.exec(notation)?.groups;
  const locusKind = LOCUS_WORD_TO_KIND.get(locusGroups?.locusWord ?? "");
  const labels = locusGroups?.atomLabels?.split("-") ?? [];
  // A bond names two atoms; a lone pair or unpaired electron names one.
  if (locusKind === undefined || labels.length !== (isBondKind(locusKind) ? 2 : 1)) {
    throw malformedLocus(notation, wholeNotation);
  }
  const atoms = labels.map((label) => parseAtomLabel(label, wholeNotation));
  checkAtomLabelsAgree(atoms, wholeNotation);
  if (isBondKind(locusKind)) {
    return bondLocus(locusKind, atoms, notation, wholeNotation);
  }
  const [onlyAtom] = atoms;
  if (onlyAtom === undefined) {
    throw malformedLocus(notation, wholeNotation);
  }
  return { locusKind, atoms: [onlyAtom] };
}

/** "σ Br3-C2" -> a sigma-bond locus with atoms C2, Br3. */
export function parseElectronLocus(notation: string): ElectronLocus {
  return parseLocus(notation, notation);
}

function countOccurrences(text: string, fragment: string): number {
  return text.split(fragment).length - 1;
}

/** "lp O1 -> σ O1-C2" -> ["lp O1", "σ O1-C2", 2]. Exactly one operator, no outer spaces. */
function splitArrow(notation: string): [string, string, 1 | 2] {
  const operatorCount =
    countOccurrences(notation, PAIR_ARROW_OPERATOR) +
    countOccurrences(notation, FISH_HOOK_OPERATOR);
  if (notation !== notation.trim() || operatorCount !== 1) {
    throw new ArrowNotationError(
      "malformed-arrow",
      `"${notation}" is not "<locus> -> <locus>" (pair) or "<locus> ~> <locus>" (fish-hook)`,
    );
  }
  const isPairArrow = notation.includes(PAIR_ARROW_OPERATOR);
  const [sourceText = "", destinationText = ""] = notation.split(
    isPairArrow ? PAIR_ARROW_OPERATOR : FISH_HOOK_OPERATOR,
  );
  return [sourceText, destinationText, isPairArrow ? 2 : 1];
}

function sameLocus(first: ElectronLocus, second: ElectronLocus): boolean {
  return formatElectronLocus(first) === formatElectronLocus(second);
}

/** "lp O1 -> σ O1-C2" -> a curved arrow. */
export function parseCurvedArrow(notation: string): CurvedArrow {
  const [sourceText, destinationText, electronsMoved] = splitArrow(notation);
  const source = parseLocus(sourceText, notation);
  const destination = parseLocus(destinationText, notation);
  checkAtomLabelsAgree([...source.atoms, ...destination.atoms], notation);
  if (sameLocus(source, destination)) {
    throw new ArrowNotationError(
      "arrow-to-itself",
      `"${notation}" starts and ends at the same place`,
    );
  }
  const hasUnpairedElectron =
    source.locusKind === "unpairedElectron" || destination.locusKind === "unpairedElectron";
  if (electronsMoved === 2 && hasUnpairedElectron) {
    throw new ArrowNotationError(
      "unpaired-electron-in-pair-arrow",
      `"${notation}" moves a pair, but an unpaired electron is one electron: use ~>`,
    );
  }
  return { source, destination, electronsMoved };
}

/** The printed form, e.g. "σ C2-Br3". */
export function formatElectronLocus(locus: ElectronLocus): string {
  const atomLabels = locus.atoms
    .map((atom) => `${atom.element}${String(atom.mapNumber)}`)
    .join("-");
  return `${LOCUS_KIND_TO_PRINTED_WORD[locus.locusKind]} ${atomLabels}`;
}

/** The printed form, e.g. "σ C2-Br3 -> lp Br3". */
export function formatCurvedArrow(curvedArrow: CurvedArrow): string {
  const operator = curvedArrow.electronsMoved === 2 ? PAIR_ARROW_OPERATOR : FISH_HOOK_OPERATOR;
  return (
    formatElectronLocus(curvedArrow.source) +
    operator +
    formatElectronLocus(curvedArrow.destination)
  );
}
