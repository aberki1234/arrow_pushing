"""Whether one misconception arrow pattern matches every arrow set another one matches.

Purpose
    Misconceptions are tried in list order and the first match wins (docs/schema-design.md
    section 5.2). An entry can never fire when an earlier, wider entry matches every arrow set
    it matches; the linter warns about it.

Rule
    A wider pattern covers a narrower one when each of its single-arrow patterns covers some
    single-arrow pattern of the narrower one. Matching is "contains", so whatever arrows match
    the narrower pattern then also match the wider one.
    A single-arrow pattern covers another when its arrow type, source and destination each
    accept everything the other's accept:
        arrow type    "*>" covers all; otherwise the same type
        locus kind    "*" alone covers every locus; "bond" covers σ and π; "*" with one atom
                      covers lp and rad, with two atoms σ and π
        atoms         "*" covers all; "O*" covers every O selector; a set of map numbers (an
                      atom label or a role) covers a subset of itself, but an element is only
                      known to fit when the narrower selector names the same element
        bare atom     a bare-atom destination covers a bare atom or a lone-pair / unpaired
                      destination whose atom it covers; it is not taken to cover a bond
                      destination, since that also depends on the arrow's source
The test is sound but not complete: when it says "covers", the wider entry really always matches
first; some covered entries are missed (the warning is advice only).
"""
from typing import FrozenSet, Optional

from arrow_notation.curved_arrow_notation import LocusKind
from attempt_assessment.arrow_patterns import (
    BARE_ATOM_KIND_WORD,
    ArrowPattern,
    AtomSelector,
    LocusPattern,
    SingleArrowPattern,
)

# The locus kinds a stored kind word accepts, by how many atoms it names.
SINGLE_ATOM_KINDS = frozenset({LocusKind.LONE_PAIR, LocusKind.UNPAIRED_ELECTRON})
BOND_KINDS = frozenset({LocusKind.SIGMA_BOND, LocusKind.PI_BOND})
STORED_WORD_TO_LOCUS_KINDS = {
    "lp": frozenset({LocusKind.LONE_PAIR}), "rad": frozenset({LocusKind.UNPAIRED_ELECTRON}),
    "σ": frozenset({LocusKind.SIGMA_BOND}), "π": frozenset({LocusKind.PI_BOND}),
    "bond": BOND_KINDS}


def _is_lone_star(locus_pattern: LocusPattern) -> bool:
    """A "*" with no atoms: any locus at all."""
    return locus_pattern.locus_kind_word == "*" and not locus_pattern.atom_selectors


def _locus_kinds(locus_pattern: LocusPattern) -> FrozenSet[LocusKind]:
    """The locus kinds a (not bare, not lone "*") locus pattern accepts."""
    if locus_pattern.locus_kind_word == "*":
        return SINGLE_ATOM_KINDS if len(locus_pattern.atom_selectors) == 1 else BOND_KINDS
    return STORED_WORD_TO_LOCUS_KINDS[locus_pattern.locus_kind_word]


def _selector_covers(wider: AtomSelector, narrower: AtomSelector) -> bool:
    """Every atom the narrower selector accepts, the wider one accepts. A role ({map numbers}
    with no element) is only known to fit an element selector if the wider one has no element."""
    element_covered = wider.element is None or wider.element == narrower.element
    map_numbers_covered = wider.map_numbers is None or (
        narrower.map_numbers is not None and narrower.map_numbers <= wider.map_numbers)
    return element_covered and map_numbers_covered


def _locus_pattern_covers(wider: LocusPattern, narrower: LocusPattern) -> bool:
    """For locus patterns that are not bare atoms. Bond atoms match in either order."""
    if _is_lone_star(wider):
        return True
    if _is_lone_star(narrower) or not _locus_kinds(narrower) <= _locus_kinds(wider):
        return False
    wider_selectors, narrower_selectors = wider.atom_selectors, narrower.atom_selectors
    if len(wider_selectors) != len(narrower_selectors):
        return False
    if len(wider_selectors) == 1:
        return _selector_covers(wider_selectors[0], narrower_selectors[0])
    in_order = all(map(_selector_covers, wider_selectors, narrower_selectors))
    swapped = all(map(_selector_covers, wider_selectors, reversed(narrower_selectors)))
    return in_order or swapped


def _destination_covers(wider: LocusPattern, narrower: LocusPattern) -> bool:
    wider_is_bare = wider.locus_kind_word == BARE_ATOM_KIND_WORD
    narrower_is_bare = narrower.locus_kind_word == BARE_ATOM_KIND_WORD
    if _is_lone_star(wider):
        return True
    if not wider_is_bare:
        # A bare atom also accepts bond destinations, which a lone-pair locus does not.
        return not narrower_is_bare and _locus_pattern_covers(wider, narrower)
    wider_selector = wider.atom_selectors[0]
    if narrower_is_bare:
        return _selector_covers(wider_selector, narrower.atom_selectors[0])
    # Electrons ending on one atom: covered if that atom is. A bond destination also depends
    # on the arrow's source, so it is not taken as covered (sound, not complete).
    return (not _is_lone_star(narrower) and _locus_kinds(narrower) <= SINGLE_ATOM_KINDS
            and _selector_covers(wider_selector, narrower.atom_selectors[0]))


def _single_arrow_pattern_covers(wider: SingleArrowPattern,
                                 narrower: SingleArrowPattern) -> bool:
    electrons_moved: Optional[int] = wider.electrons_moved
    arrow_type_covered = electrons_moved is None or electrons_moved == narrower.electrons_moved
    return (arrow_type_covered and _locus_pattern_covers(wider.source, narrower.source)
            and _destination_covers(wider.destination, narrower.destination))


def arrow_pattern_covers(wider_pattern: ArrowPattern, narrower_pattern: ArrowPattern) -> bool:
    """True when every arrow set matched by `narrower_pattern` is matched by `wider_pattern`
    (as far as this test can tell; see the module docstring)."""
    return all(any(_single_arrow_pattern_covers(wider, narrower)
                   for narrower in narrower_pattern.single_arrow_patterns)
               for wider in wider_pattern.single_arrow_patterns)
