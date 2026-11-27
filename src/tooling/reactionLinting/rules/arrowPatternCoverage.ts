/**
 * Whether one misconception arrow pattern matches every arrow set another one matches.
 *
 * Purpose
 *   Misconceptions are tried in list order and the first match wins (docs/schema-design.md §5.2).
 *   An entry can never fire when an earlier, wider entry matches every arrow set it matches; the
 *   linter warns about it.
 *
 * Rule
 *   A wider pattern covers a narrower one when each of its single-arrow patterns covers some
 *   single-arrow pattern of the narrower one. Matching is "contains", so whatever arrows match the
 *   narrower pattern then also match the wider one.
 *   A single-arrow pattern covers another when its arrow type, source and destination each accept
 *   everything the other's accept:
 *     arrow type  "*>" covers all; otherwise the same type
 *     locus kind  "*" alone covers every locus; "bond" covers σ and π; "*" with one atom covers lp
 *                 and rad, with two atoms σ and π
 *     atoms       "*" covers all; "O*" covers every O selector; a set of map numbers (an atom label
 *                 or a role) covers a subset of itself, but an element is only known to fit when
 *                 the narrower selector names the same element
 *     bare atom   a bare-atom destination covers a bare atom or a lone-pair / unpaired destination
 *                 whose atom it covers; it is not taken to cover a bond destination, since that
 *                 also depends on the arrow's source
 * The test is sound but not complete: when it says "covers", the wider entry really always matches
 * first; some covered entries are missed (the warning is advice only).
 */
import type { LocusKind } from "../../../core/arrowNotation/curvedArrowNotation.js";
import {
  type ArrowPattern,
  type AtomSelector,
  BARE_ATOM_KIND_WORD,
  type LocusPattern,
  type SingleArrowPattern,
} from "../../../core/attemptAssessment/arrowPatterns.js";

// The locus kinds a stored kind word accepts, by how many atoms it names.
const SINGLE_ATOM_KINDS: ReadonlySet<LocusKind> = new Set(["lonePair", "unpairedElectron"]);
const BOND_KINDS: ReadonlySet<LocusKind> = new Set(["sigmaBond", "piBond"]);
const STORED_WORD_TO_LOCUS_KINDS: ReadonlyMap<string, ReadonlySet<LocusKind>> = new Map([
  ["lp", new Set<LocusKind>(["lonePair"])],
  ["rad", new Set<LocusKind>(["unpairedElectron"])],
  ["σ", new Set<LocusKind>(["sigmaBond"])],
  ["π", new Set<LocusKind>(["piBond"])],
  ["bond", BOND_KINDS],
]);

/** A "*" with no atoms: any locus at all. */
function isLoneStar(locusPattern: LocusPattern): boolean {
  return locusPattern.locusKindWord === "*" && locusPattern.atomSelectors.length === 0;
}

/** The locus kinds a (not bare, not lone "*") locus pattern accepts. */
function locusKinds(locusPattern: LocusPattern): ReadonlySet<LocusKind> {
  if (locusPattern.locusKindWord === "*") {
    return locusPattern.atomSelectors.length === 1 ? SINGLE_ATOM_KINDS : BOND_KINDS;
  }
  return STORED_WORD_TO_LOCUS_KINDS.get(locusPattern.locusKindWord) ?? new Set();
}

function isSubset<Item>(smaller: ReadonlySet<Item>, larger: ReadonlySet<Item>): boolean {
  return [...smaller].every((item) => larger.has(item));
}

/**
 * Every atom the narrower selector accepts, the wider one accepts. A role (map numbers with no
 * element) is only known to fit an element selector if the wider one has no element.
 */
function selectorCovers(
  wider: AtomSelector | undefined,
  narrower: AtomSelector | undefined,
): boolean {
  if (wider === undefined || narrower === undefined) {
    return false;
  }
  const elementCovered = wider.element === undefined || wider.element === narrower.element;
  const mapNumbersCovered =
    wider.mapNumbers === undefined ||
    (narrower.mapNumbers !== undefined && isSubset(narrower.mapNumbers, wider.mapNumbers));
  return elementCovered && mapNumbersCovered;
}

/** For locus patterns that are not bare atoms. Bond atoms match in either order. */
function locusPatternCovers(wider: LocusPattern, narrower: LocusPattern): boolean {
  if (isLoneStar(wider)) {
    return true;
  }
  if (isLoneStar(narrower) || !isSubset(locusKinds(narrower), locusKinds(wider))) {
    return false;
  }
  const [widerFirst, widerSecond] = wider.atomSelectors;
  const [narrowerFirst, narrowerSecond] = narrower.atomSelectors;
  if (wider.atomSelectors.length !== narrower.atomSelectors.length) {
    return false;
  }
  if (wider.atomSelectors.length === 1) {
    return selectorCovers(widerFirst, narrowerFirst);
  }
  const inOrder =
    selectorCovers(widerFirst, narrowerFirst) && selectorCovers(widerSecond, narrowerSecond);
  const swapped =
    selectorCovers(widerFirst, narrowerSecond) && selectorCovers(widerSecond, narrowerFirst);
  return inOrder || swapped;
}

function destinationCovers(wider: LocusPattern, narrower: LocusPattern): boolean {
  const narrowerIsBare = narrower.locusKindWord === BARE_ATOM_KIND_WORD;
  if (isLoneStar(wider)) {
    return true;
  }
  if (wider.locusKindWord !== BARE_ATOM_KIND_WORD) {
    // A bare atom also accepts bond destinations, which a lone-pair locus does not.
    return !narrowerIsBare && locusPatternCovers(wider, narrower);
  }
  if (narrowerIsBare) {
    return selectorCovers(wider.atomSelectors[0], narrower.atomSelectors[0]);
  }
  // Electrons ending on one atom: covered if that atom is. A bond destination also depends on
  // the arrow's source, so it is not taken as covered (sound, not complete).
  return (
    !isLoneStar(narrower) &&
    isSubset(locusKinds(narrower), SINGLE_ATOM_KINDS) &&
    selectorCovers(wider.atomSelectors[0], narrower.atomSelectors[0])
  );
}

function singleArrowPatternCovers(
  wider: SingleArrowPattern,
  narrower: SingleArrowPattern,
): boolean {
  const arrowTypeCovered =
    wider.electronsMoved === undefined || wider.electronsMoved === narrower.electronsMoved;
  return (
    arrowTypeCovered &&
    locusPatternCovers(wider.source, narrower.source) &&
    destinationCovers(wider.destination, narrower.destination)
  );
}

/**
 * True when every arrow set matched by `narrowerPattern` is matched by `widerPattern` (as far as
 * this test can tell; see the module comment).
 */
export function arrowPatternCovers(
  widerPattern: ArrowPattern,
  narrowerPattern: ArrowPattern,
): boolean {
  return widerPattern.singleArrowPatterns.every((wider) =>
    narrowerPattern.singleArrowPatterns.some((narrower) =>
      singleArrowPatternCovers(wider, narrower),
    ),
  );
}
