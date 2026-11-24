"""Parse and print the curved-arrow notation, e.g. "lp O1 -> σ O1-C2".

Purpose
    Content, the editor, the linter and the tests write curved arrows as text. This module turns
    that text into a structure (and back), so every part of the code compares arrows the same way.
    The TypeScript twin is src/arrowNotation/curvedArrowNotation.ts; both pass the shared cases in
    fixtures/notation/curved_arrows.json.

Terms (docs/schema-design.md section 0)
    atom label       Element + map number, e.g. "O1", "Cl12". The map number names one atom for
                     the whole reaction.
    electron locus   Where electrons sit: "lp X" (lone pair), "rad X" (unpaired electron),
                     "σ X-Y" (sigma bond), "π X-Y" (pi bond). "sigma" and "pi" are accepted too.
    curved arrow     "<source locus> -> <destination locus>" moves a pair of electrons;
                     "~>" (a fish-hook) moves one electron. The destination is where the
                     electrons end up.
    printed form     σ and π symbols, bond atoms in ascending map-number order, single spaces.
                     Two notations that mean the same arrow parse to equal structures and print
                     the same.

Error codes, checked in this order (the first that applies is raised)
    malformed-arrow                    not "<locus> -> <locus>" or "<locus> ~> <locus>"
    malformed-locus                    a locus is not "lp X", "rad X", "σ X-Y" or "π X-Y"
    malformed-atom-label               an atom label is not element + map number (no leading 0)
    conflicting-atom-labels            one map number appears with two elements
    bond-to-same-atom                  a bond joins an atom to itself
    arrow-to-itself                    the source and destination are the same locus
    unpaired-electron-in-pair-arrow    "rad" in a pair arrow (an unpaired electron is one electron)
Checks that need the molecule (does O1 have a lone pair?) are not made here.
"""
import re
from dataclasses import dataclass
from enum import StrEnum
from typing import Dict, Tuple

# The two arrow operators: a pair arrow moves 2 electrons, a fish-hook 1.
PAIR_ARROW_OPERATOR = " -> "
FISH_HOOK_OPERATOR = " ~> "


class LocusKind(StrEnum):
    """The values are the JSON spellings used in fixtures and in TypeScript."""
    LONE_PAIR = "lonePair"
    UNPAIRED_ELECTRON = "unpairedElectron"
    SIGMA_BOND = "sigmaBond"
    PI_BOND = "piBond"


# The words a locus may start with, and the word each kind is printed with.
LOCUS_WORD_TO_KIND = {
    "lp": LocusKind.LONE_PAIR, "rad": LocusKind.UNPAIRED_ELECTRON,
    "σ": LocusKind.SIGMA_BOND, "sigma": LocusKind.SIGMA_BOND,
    "π": LocusKind.PI_BOND, "pi": LocusKind.PI_BOND,
}
LOCUS_KIND_TO_PRINTED_WORD = {
    LocusKind.LONE_PAIR: "lp", LocusKind.UNPAIRED_ELECTRON: "rad",
    LocusKind.SIGMA_BOND: "σ", LocusKind.PI_BOND: "π",
}

# A locus is a word, one space, then one atom label, or two joined by "-". Atom labels are only
# roughly matched here ([^\s-]+), so that a bad label gets its own error code.
LOCUS_PATTERN = re.compile(
    r"(?P<locus_word>lp|rad|σ|sigma|π|pi) (?P<atom_labels>[^\s-]+(?:-[^\s-]+)?)")
BOND_KINDS = (LocusKind.SIGMA_BOND, LocusKind.PI_BOND)
ATOM_LABEL_PATTERN = re.compile(r"(?P<element>[A-Z][a-z]?)(?P<map_number>[1-9][0-9]*)")


class ArrowNotationError(ValueError):
    """Notation that cannot be read. `error_code` is one of the codes in the module docstring."""

    def __init__(self, error_code: str, message: str) -> None:
        super().__init__(message)
        self.error_code = error_code


@dataclass(frozen=True)
class AtomLabel:
    element: str
    map_number: int


@dataclass(frozen=True)
class ElectronLocus:
    """`atoms` holds one atom for a lone pair or unpaired electron, and two atoms (ascending map
    number) for a bond."""
    locus_kind: LocusKind
    atoms: Tuple[AtomLabel, ...]


@dataclass(frozen=True)
class CurvedArrow:
    """`electrons_moved` is 2 for a pair arrow (->) and 1 for a fish-hook (~>)."""
    source: ElectronLocus
    destination: ElectronLocus
    electrons_moved: int


def _parse_atom_label(label: str, whole_notation: str) -> AtomLabel:
    """"Cl12" -> AtomLabel("Cl", 12). The map number has no leading zero, so it is at least 1."""
    label_match = ATOM_LABEL_PATTERN.fullmatch(label)
    if label_match is None:
        raise ArrowNotationError(
            "malformed-atom-label",
            f'"{label}" in "{whole_notation}" is not an element followed by a map number, e.g. O1')
    return AtomLabel(element=label_match["element"], map_number=int(label_match["map_number"]))


def _check_atom_labels_agree(atoms: Tuple[AtomLabel, ...], whole_notation: str) -> None:
    """Raise conflicting-atom-labels if one map number appears with two elements."""
    map_number_to_element: Dict[int, str] = {}
    for atom in atoms:
        known_element = map_number_to_element.setdefault(atom.map_number, atom.element)
        if known_element != atom.element:
            raise ArrowNotationError(
                "conflicting-atom-labels",
                f'map number {atom.map_number} is both {known_element} and {atom.element} '
                f'in "{whole_notation}"')


def _parse_locus(notation: str, whole_notation: str) -> ElectronLocus:
    """Parse one locus; `whole_notation` is quoted in error messages."""
    locus_match = LOCUS_PATTERN.fullmatch(notation)
    locus_kind = LOCUS_WORD_TO_KIND[locus_match["locus_word"]] if locus_match else None
    labels = locus_match["atom_labels"].split("-") if locus_match else []
    # A bond names two atoms; a lone pair or unpaired electron names one.
    expected_label_count = 2 if locus_kind in BOND_KINDS else 1
    if locus_kind is None or len(labels) != expected_label_count:
        raise ArrowNotationError(
            "malformed-locus",
            f'"{notation}" in "{whole_notation}" is not "lp X", "rad X", "σ X-Y" or "π X-Y"')
    atoms = tuple(_parse_atom_label(label, whole_notation) for label in labels)
    _check_atom_labels_agree(atoms, whole_notation)
    if len(atoms) == 2 and atoms[0].map_number == atoms[1].map_number:
        raise ArrowNotationError(
            "bond-to-same-atom",
            f'the bond "{notation}" in "{whole_notation}" joins an atom to itself')
    return ElectronLocus(locus_kind, tuple(sorted(atoms, key=lambda atom: atom.map_number)))


def parse_electron_locus(notation: str) -> ElectronLocus:
    """"σ Br3-C2" -> ElectronLocus(SIGMA_BOND, (C2, Br3)). Raises ArrowNotationError with
    malformed-locus, malformed-atom-label, conflicting-atom-labels or bond-to-same-atom."""
    return _parse_locus(notation, notation)


def _split_arrow(notation: str) -> Tuple[str, str, int]:
    """"lp O1 -> σ O1-C2" -> ("lp O1", "σ O1-C2", 2). Exactly one operator, no outer spaces."""
    operator_count = notation.count(PAIR_ARROW_OPERATOR) + notation.count(FISH_HOOK_OPERATOR)
    if notation != notation.strip() or operator_count != 1:
        raise ArrowNotationError(
            "malformed-arrow",
            f'"{notation}" is not "<locus> -> <locus>" (pair) or "<locus> ~> <locus>" (fish-hook)')
    for operator, electrons_moved in ((PAIR_ARROW_OPERATOR, 2), (FISH_HOOK_OPERATOR, 1)):
        if operator in notation:
            source_text, destination_text = notation.split(operator)
            return source_text, destination_text, electrons_moved
    raise AssertionError("unreachable: exactly one operator was counted")


def parse_curved_arrow(notation: str) -> CurvedArrow:
    """"lp O1 -> σ O1-C2" -> CurvedArrow. Raises ArrowNotationError (see the module docstring)."""
    source_text, destination_text, electrons_moved = _split_arrow(notation)
    source = _parse_locus(source_text, notation)
    destination = _parse_locus(destination_text, notation)
    _check_atom_labels_agree(source.atoms + destination.atoms, notation)
    if source == destination:
        raise ArrowNotationError(
            "arrow-to-itself", f'"{notation}" starts and ends at the same place')
    locus_kinds = (source.locus_kind, destination.locus_kind)
    has_unpaired_electron = LocusKind.UNPAIRED_ELECTRON in locus_kinds
    if electrons_moved == 2 and has_unpaired_electron:
        raise ArrowNotationError(
            "unpaired-electron-in-pair-arrow",
            f'"{notation}" moves a pair, but an unpaired electron is one electron: use ~>')
    return CurvedArrow(source=source, destination=destination, electrons_moved=electrons_moved)


def format_electron_locus(locus: ElectronLocus) -> str:
    """The printed form, e.g. "σ C2-Br3"."""
    atom_labels = "-".join(f"{atom.element}{atom.map_number}" for atom in locus.atoms)
    return f"{LOCUS_KIND_TO_PRINTED_WORD[locus.locus_kind]} {atom_labels}"


def format_curved_arrow(curved_arrow: CurvedArrow) -> str:
    """The printed form, e.g. "σ C2-Br3 -> lp Br3"."""
    operator = PAIR_ARROW_OPERATOR if curved_arrow.electrons_moved == 2 else FISH_HOOK_OPERATOR
    return (format_electron_locus(curved_arrow.source) + operator
            + format_electron_locus(curved_arrow.destination))
