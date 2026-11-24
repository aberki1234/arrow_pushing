"""Misconception arrow patterns: parse them, and match them against a learner's arrows.

Grammar (docs/schema-design.md section 5.2)
    arrowPattern        := singleArrowPattern ( ";" singleArrowPattern )*
    singleArrowPattern  := sourcePattern ( "->" | "~>" | "*>" ) destinationPattern
    sourcePattern       := "*" | locusKind atomSelector | locusKind atomSelector "-" atomSelector
    destinationPattern  := a source-style locus pattern, or a bare atomSelector
    locusKind           := lp | rad | σ | sigma | π | pi | bond | *
    atomSelector        := O1 | O* | @roleName | *
"->" matches pair arrows, "~>" fish-hooks, "*>" either. "bond" means σ or π. A "*" kind with one
atom means a lone pair or unpaired electron on it; with two atoms, any bond between them.
"@roleName" means any atom listed for that role in atomRoleToMapNumbers.

Matching
    A bare atom destination ("lp O1 -> Br3") matches when the electrons end on that atom (a lone
    pair or unpaired electron there) or form a bond to it from a different atom ("σ O1-Br3",
    "π O1-Br3"). Bond atoms match in either order. A pattern matches a set of learner arrows when
    each of its single-arrow patterns is matched by some learner arrow (other arrows may be
    present too). Symmetry is applied by the caller.

Error codes (ArrowPatternError.error_code): malformed-arrow-pattern, unknown-atom-role.
"""
import re
from dataclasses import dataclass
from typing import Dict, FrozenSet, List, Optional, Sequence, Tuple

from arrow_notation.curved_arrow_notation import AtomLabel, CurvedArrow, ElectronLocus, LocusKind


class ArrowPatternError(ValueError):
    """A pattern that cannot be read; `error_code` says why."""

    def __init__(self, error_code: str, message: str) -> None:
        super().__init__(message)
        self.error_code = error_code


@dataclass(frozen=True)
class AtomSelector:
    """Which atoms a selector accepts: None means any element / any map number."""
    element: Optional[str]
    map_numbers: Optional[FrozenSet[int]]


@dataclass(frozen=True)
class LocusPattern:
    """`locus_kind_word` is lp, rad, σ, π, bond or * (sigma/pi are stored as σ/π), or "atom" for
    a bare atom destination. `atom_selectors` is empty for a lone "*"."""
    locus_kind_word: str
    atom_selectors: Tuple[AtomSelector, ...]


@dataclass(frozen=True)
class SingleArrowPattern:
    """`electrons_moved` is 2 for "->", 1 for "~>", None for "*>"."""
    source: LocusPattern
    destination: LocusPattern
    electrons_moved: Optional[int]


@dataclass(frozen=True)
class ArrowPattern:
    single_arrow_patterns: Tuple[SingleArrowPattern, ...]


# The arrow operators and the electrons each matches (None: either kind of arrow).
OPERATOR_TO_ELECTRONS_MOVED: Dict[str, Optional[int]] = {" -> ": 2, " ~> ": 1, " *> ": None}
# Locus-kind words as written, and as stored (sigma/pi are stored as their symbols).
LOCUS_KIND_WORD_TO_STORED_WORD = {
    "lp": "lp", "rad": "rad", "σ": "σ", "sigma": "σ", "π": "π", "pi": "π", "bond": "bond", "*": "*"}
# How many atoms each stored kind word names; "*" may name one (an atom locus) or two (a bond).
STORED_WORD_TO_ALLOWED_ATOM_COUNTS = {
    "lp": (1,), "rad": (1,), "σ": (2,), "π": (2,), "bond": (2,), "*": (1, 2)}
# Which stored kind words accept each kind of locus.
LOCUS_KIND_TO_ACCEPTING_WORDS = {
    LocusKind.LONE_PAIR: {"lp", "*"}, LocusKind.UNPAIRED_ELECTRON: {"rad", "*"},
    LocusKind.SIGMA_BOND: {"σ", "bond", "*"}, LocusKind.PI_BOND: {"π", "bond", "*"}}
ATOM_SELECTOR_PATTERN = re.compile(
    r"(?P<element>[A-Z][a-z]?)(?P<map_number>[1-9][0-9]*|\*)|@(?P<role>[a-z][A-Za-z0-9]*)|\*")
BARE_ATOM_KIND_WORD = "atom"


def _malformed(detail: str, whole_pattern: str) -> ArrowPatternError:
    return ArrowPatternError("malformed-arrow-pattern", f'"{whole_pattern}": {detail}')


def _parse_atom_selector(text: str, atom_role_to_map_numbers: Dict[str, List[int]],
                         whole_pattern: str) -> AtomSelector:
    selector_match = ATOM_SELECTOR_PATTERN.fullmatch(text)
    if selector_match is None:
        raise _malformed(f'"{text}" is not O1, O*, @role or *', whole_pattern)
    if selector_match["role"] is not None:
        if selector_match["role"] not in atom_role_to_map_numbers:
            raise ArrowPatternError(
                "unknown-atom-role",
                f'"{whole_pattern}": role @{selector_match["role"]} is not in atomRoleToMapNumbers')
        return AtomSelector(None, frozenset(atom_role_to_map_numbers[selector_match["role"]]))
    if selector_match["element"] is None:
        return AtomSelector(None, None)
    map_number_text = selector_match["map_number"]
    map_numbers = None if map_number_text == "*" else frozenset({int(map_number_text)})
    return AtomSelector(selector_match["element"], map_numbers)


def _parse_locus_pattern(text: str, atom_role_to_map_numbers: Dict[str, List[int]],
                         whole_pattern: str, is_destination: bool) -> LocusPattern:
    """A locus pattern; a destination may also be a bare atom selector."""
    if text == "*":
        return LocusPattern("*", ())
    words = text.split(" ")
    if len(words) == 1 and is_destination:
        return LocusPattern(BARE_ATOM_KIND_WORD, (
            _parse_atom_selector(words[0], atom_role_to_map_numbers, whole_pattern),))
    stored_word = LOCUS_KIND_WORD_TO_STORED_WORD.get(words[0]) if len(words) == 2 else None
    selector_texts = words[1].split("-") if stored_word is not None else []
    if stored_word is None or len(selector_texts) not in STORED_WORD_TO_ALLOWED_ATOM_COUNTS[
            stored_word]:
        raise _malformed(f'"{text}" is not a locus pattern such as "lp O1" or "bond C2-Br3"',
                         whole_pattern)
    return LocusPattern(stored_word, tuple(
        _parse_atom_selector(selector_text, atom_role_to_map_numbers, whole_pattern)
        for selector_text in selector_texts))


def _parse_single_arrow_pattern(text: str, atom_role_to_map_numbers: Dict[str, List[int]],
                                whole_pattern: str) -> SingleArrowPattern:
    operators_found = [operator for operator in OPERATOR_TO_ELECTRONS_MOVED
                       for _ in range(text.count(operator))]
    if len(operators_found) != 1:
        raise _malformed(f'"{text}" needs exactly one of " -> ", " ~> ", " *> "', whole_pattern)
    operator = operators_found[0]
    source_text, destination_text = text.split(operator)
    return SingleArrowPattern(
        source=_parse_locus_pattern(source_text, atom_role_to_map_numbers, whole_pattern, False),
        destination=_parse_locus_pattern(destination_text, atom_role_to_map_numbers,
                                         whole_pattern, True),
        electrons_moved=OPERATOR_TO_ELECTRONS_MOVED[operator])


def parse_arrow_pattern(pattern_text: str,
                        atom_role_to_map_numbers: Dict[str, List[int]]) -> ArrowPattern:
    """Parse one misconception's arrowPattern. Raises ArrowPatternError."""
    single_texts = [part.strip() for part in pattern_text.split(";")]
    if any(not single_text for single_text in single_texts):
        raise _malformed("an arrow pattern is empty", pattern_text)
    return ArrowPattern(tuple(
        _parse_single_arrow_pattern(single_text, atom_role_to_map_numbers, pattern_text)
        for single_text in single_texts))


def _selector_accepts(selector: AtomSelector, atom: AtomLabel) -> bool:
    element_fits = selector.element is None or selector.element == atom.element
    map_number_fits = selector.map_numbers is None or atom.map_number in selector.map_numbers
    return element_fits and map_number_fits


def _locus_matches(locus_pattern: LocusPattern, locus: ElectronLocus) -> bool:
    if locus_pattern.locus_kind_word == "*" and not locus_pattern.atom_selectors:
        return True
    selectors = locus_pattern.atom_selectors
    if (locus_pattern.locus_kind_word not in LOCUS_KIND_TO_ACCEPTING_WORDS[locus.locus_kind]
            or len(selectors) != len(locus.atoms)):
        return False
    if len(selectors) == 1:
        return _selector_accepts(selectors[0], locus.atoms[0])
    first_atom, second_atom = locus.atoms
    in_order = _selector_accepts(selectors[0], first_atom) and _selector_accepts(
        selectors[1], second_atom)
    swapped = _selector_accepts(selectors[0], second_atom) and _selector_accepts(
        selectors[1], first_atom)
    return in_order or swapped


def _destination_matches(destination_pattern: LocusPattern, curved_arrow: CurvedArrow) -> bool:
    """A bare atom destination: electrons end on that atom, or bond to it from another atom."""
    destination = curved_arrow.destination
    if destination_pattern.locus_kind_word != BARE_ATOM_KIND_WORD:
        return _locus_matches(destination_pattern, destination)
    selector = destination_pattern.atom_selectors[0]
    if len(destination.atoms) == 1:
        return _selector_accepts(selector, destination.atoms[0])
    source_map_numbers = {atom.map_number for atom in curved_arrow.source.atoms}
    return any(_selector_accepts(selector, atom) and atom.map_number not in source_map_numbers
               for atom in destination.atoms)


def _single_arrow_pattern_matches(single_arrow_pattern: SingleArrowPattern,
                                  curved_arrow: CurvedArrow) -> bool:
    electrons_fit = single_arrow_pattern.electrons_moved in (None, curved_arrow.electrons_moved)
    return (electrons_fit and _locus_matches(single_arrow_pattern.source, curved_arrow.source)
            and _destination_matches(single_arrow_pattern.destination, curved_arrow))


def arrow_pattern_matches(arrow_pattern: ArrowPattern,
                          curved_arrows: Sequence[CurvedArrow]) -> bool:
    """True when every single-arrow pattern is matched by some arrow in `curved_arrows`."""
    return all(any(_single_arrow_pattern_matches(single_arrow_pattern, curved_arrow)
                   for curved_arrow in curved_arrows)
               for single_arrow_pattern in arrow_pattern.single_arrow_patterns)
