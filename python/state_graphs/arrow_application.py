"""Apply the curved arrows of one step to a state, or a change step's added and removed molecules.

Purpose
    The learner's arrows (and the author's) are checked by applying them: the result must be a
    real state, and the validator then compares it with the step's to-state. The TypeScript twin
    is src/stateGraphs/arrowApplication.ts; both pass fixtures/state_graphs/
    arrow_application_cases.json.

How arrows move electrons (all arrows of a step are applied together)
    source lp X          X loses electrons_moved nonbonding electrons
    source rad X         X loses its unpaired electron (fish-hook only; the parser refuses ->)
    source σ/π A-B       the A-B bond loses electrons_moved electrons
    destination lp X     X gains a pair (pair arrows only)
    destination rad X    X gains one nonbonding electron (fish-hook only)
    destination σ/π A-B  the A-B bond gains electrons_moved electrons
    A bond ends with (2 * order + electrons gained - electrons lost) electrons, which must be even;
    a bond with no electrons left is removed.

Generic rule ids (ArrowApplicationError.generic_rule_id), checked in this order
    Before applying, for each arrow in turn:
    1. atom-not-in-state                   an atom label names no atom of the state (or the
                                           wrong element)
    2. destination-not-adjacent-to-source  source and destination share no atom
    3. no-electrons-at-source              no lone pair / unpaired electron there, no such bond,
                                           or a π source on a single bond
    4. destination-bond-already-exists     a σ destination where the atoms are already bonded
       destination-bond-missing            a π destination where the atoms are not bonded
    5. fish-hook-to-lone-pair              one electron cannot become a lone pair: use rad X
    After applying all arrows:
    6. odd-electrons-in-bond               a bond left with an odd number of electrons
    7. no-electrons-at-source              a lone pair or bond used more often than it exists
    8. bond-order-above-three
    9. octet-exceeded                      an atom touched by an arrow has more valence-shell
                                           electrons than its period allows (2, 8, or 12)

Change steps
    apply_species_change() adds a change step's molecules (new map numbers only) and removes whole
    molecules. Error codes (SpeciesChangeError.error_code): added-map-number-in-use,
    removed-map-number-absent.
"""
from collections import Counter
from dataclasses import replace
from typing import Dict, Optional, Sequence, Set

from arrow_notation.curved_arrow_notation import (
    CurvedArrow,
    ElectronLocus,
    LocusKind,
    format_curved_arrow,
)

from state_graphs.state_graph import (
    BondKey,
    StateGraph,
    bond_key,
    lone_pair_count,
    maximum_valence_shell_electrons,
    unpaired_electron_count,
    valence_shell_electron_count,
)

BOND_KINDS = (LocusKind.SIGMA_BOND, LocusKind.PI_BOND)
MAXIMUM_BOND_ORDER = 3  # a triple bond


class ArrowApplicationError(ValueError):
    """Arrows that cannot be applied to the state; `generic_rule_id` says which rule they break."""

    def __init__(self, generic_rule_id: str, message: str) -> None:
        super().__init__(message)
        self.generic_rule_id = generic_rule_id


class SpeciesChangeError(ValueError):
    """A change step that does not fit the state; `error_code` says why."""

    def __init__(self, error_code: str, message: str) -> None:
        super().__init__(message)
        self.error_code = error_code


def _locus_bond_key(locus: ElectronLocus) -> BondKey:
    first_atom, second_atom = locus.atoms
    return bond_key(first_atom.map_number, second_atom.map_number)


def _check_atoms_in_state(graph: StateGraph, curved_arrow: CurvedArrow) -> None:
    """Rule 1: every atom label names an atom of the state, with the right element."""
    for atom_label in curved_arrow.source.atoms + curved_arrow.destination.atoms:
        state_atom = graph.map_number_to_atom.get(atom_label.map_number)
        if state_atom is None or state_atom.element != atom_label.element:
            raise ArrowApplicationError(
                "atom-not-in-state",
                f'"{format_curved_arrow(curved_arrow)}": the state has no atom '
                f"{atom_label.element}{atom_label.map_number}")


def _check_adjacent(curved_arrow: CurvedArrow) -> None:
    """Rule 2: electrons move to a neighbouring place, so source and destination share an atom."""
    source_map_numbers = {atom.map_number for atom in curved_arrow.source.atoms}
    destination_map_numbers = {atom.map_number for atom in curved_arrow.destination.atoms}
    if not source_map_numbers & destination_map_numbers:
        raise ArrowApplicationError(
            "destination-not-adjacent-to-source",
            f'"{format_curved_arrow(curved_arrow)}": the electrons must end next to where they '
            "start")


def _source_holds_electrons(graph: StateGraph, source: ElectronLocus) -> bool:
    if source.locus_kind == LocusKind.LONE_PAIR:
        return lone_pair_count(graph.map_number_to_atom[source.atoms[0].map_number]) >= 1
    if source.locus_kind == LocusKind.UNPAIRED_ELECTRON:
        return unpaired_electron_count(graph.map_number_to_atom[source.atoms[0].map_number]) >= 1
    # A σ source needs a bond; a π source needs at least a double bond.
    minimum_order = 1 if source.locus_kind == LocusKind.SIGMA_BOND else 2
    return graph.bond_to_order.get(_locus_bond_key(source), 0) >= minimum_order


def _check_source_and_destination(graph: StateGraph, curved_arrow: CurvedArrow) -> None:
    """Rules 3 to 5, on the state before any arrow is applied."""
    notation = format_curved_arrow(curved_arrow)
    destination = curved_arrow.destination
    if not _source_holds_electrons(graph, curved_arrow.source):
        raise ArrowApplicationError("no-electrons-at-source",
                                    f'"{notation}": there are no such electrons to move')
    if destination.locus_kind in BOND_KINDS:
        is_bonded = _locus_bond_key(destination) in graph.bond_to_order
        if destination.locus_kind == LocusKind.SIGMA_BOND and is_bonded:
            raise ArrowApplicationError(
                "destination-bond-already-exists",
                f'"{notation}": these atoms are already bonded; a further bond is a π bond')
        if destination.locus_kind == LocusKind.PI_BOND and not is_bonded:
            raise ArrowApplicationError(
                "destination-bond-missing",
                f'"{notation}": a π bond needs a σ bond between the atoms first')
    if destination.locus_kind == LocusKind.LONE_PAIR and curved_arrow.electrons_moved == 1:
        raise ArrowApplicationError(
            "fish-hook-to-lone-pair",
            f'"{notation}": one electron cannot become a lone pair; use rad for an unpaired one')


def _electron_changes(
        curved_arrows: Sequence[CurvedArrow]) -> tuple[Counter[int], Counter[BondKey]]:
    """How many nonbonding electrons each atom gains (negative: loses), and how many electrons
    each bond gains, when all arrows move their electrons."""
    map_number_to_nonbonding_change: Counter[int] = Counter()
    bond_to_electron_change: Counter[BondKey] = Counter()
    for curved_arrow in curved_arrows:
        for locus, sign in ((curved_arrow.source, -1), (curved_arrow.destination, +1)):
            electron_change = sign * curved_arrow.electrons_moved
            if locus.locus_kind in BOND_KINDS:
                bond_to_electron_change[_locus_bond_key(locus)] += electron_change
            else:
                map_number_to_nonbonding_change[locus.atoms[0].map_number] += electron_change
    return map_number_to_nonbonding_change, bond_to_electron_change


def _bond_orders_after(graph: StateGraph,
                       bond_to_electron_change: Counter[BondKey]) -> Dict[BondKey, int]:
    """Rules 6 to 8 for bonds: each bond's electrons after the arrows, as a bond order."""
    bond_to_order = dict(graph.bond_to_order)
    for key, electron_change in sorted(bond_to_electron_change.items()):
        bond_electron_count = 2 * bond_to_order.get(key, 0) + electron_change
        bond_label = f"the bond between atoms {key[0]} and {key[1]}"
        if bond_electron_count % 2 == 1:
            raise ArrowApplicationError(
                "odd-electrons-in-bond",
                f"{bond_label} would hold {bond_electron_count} electrons; a bond holds pairs")
        if bond_electron_count < 0:
            raise ArrowApplicationError(
                "no-electrons-at-source", f"{bond_label} would lose more electrons than it has")
        if bond_electron_count // 2 > MAXIMUM_BOND_ORDER:
            raise ArrowApplicationError(
                "bond-order-above-three",
                f"{bond_label} would have order {bond_electron_count // 2}")
        bond_to_order[key] = bond_electron_count // 2
    return {key: order for key, order in bond_to_order.items() if order > 0}


def _check_octets(graph: StateGraph, touched_map_numbers: Set[int]) -> None:
    """Rule 9, for the atoms an arrow touched (others are as the author drew them)."""
    for map_number in sorted(touched_map_numbers):
        element = graph.map_number_to_atom[map_number].element
        electron_count = valence_shell_electron_count(graph, map_number)
        if electron_count > maximum_valence_shell_electrons(element):
            raise ArrowApplicationError(
                "octet-exceeded",
                f"{element}{map_number} would have {electron_count} valence-shell electrons "
                f"(at most {maximum_valence_shell_electrons(element)})")


def apply_curved_arrows(graph: StateGraph, curved_arrows: Sequence[CurvedArrow]) -> StateGraph:
    """The state after all `curved_arrows` move their electrons at once. `graph` is not changed.
    Raises ArrowApplicationError (rules in the module docstring)."""
    for curved_arrow in curved_arrows:
        _check_atoms_in_state(graph, curved_arrow)
        _check_adjacent(curved_arrow)
        _check_source_and_destination(graph, curved_arrow)
    map_number_to_nonbonding_change, bond_to_electron_change = _electron_changes(curved_arrows)
    bond_to_order = _bond_orders_after(graph, bond_to_electron_change)
    map_number_to_atom = dict(graph.map_number_to_atom)
    for map_number, electron_change in sorted(map_number_to_nonbonding_change.items()):
        atom = map_number_to_atom[map_number]
        nonbonding_electron_count = atom.nonbonding_electron_count + electron_change
        if nonbonding_electron_count < 0:
            raise ArrowApplicationError(
                "no-electrons-at-source",
                f"{atom.element}{map_number} would give away more electrons than it has")
        map_number_to_atom[map_number] = replace(
            atom, nonbonding_electron_count=nonbonding_electron_count)
    applied_graph = StateGraph(map_number_to_atom, bond_to_order)
    touched_map_numbers = {atom.map_number for curved_arrow in curved_arrows
                           for atom in curved_arrow.source.atoms + curved_arrow.destination.atoms}
    _check_octets(applied_graph, touched_map_numbers)
    return applied_graph


def _molecule_map_numbers(graph: StateGraph, start_map_number: int) -> Set[int]:
    """The map numbers of the molecule (connected fragment) that contains `start_map_number`."""
    molecule_map_numbers = {start_map_number}
    map_numbers_to_visit = [start_map_number]
    while map_numbers_to_visit:
        current_map_number = map_numbers_to_visit.pop()
        for first_map_number, second_map_number in graph.bond_to_order:
            if current_map_number in (first_map_number, second_map_number):
                neighbour = (second_map_number if current_map_number == first_map_number
                             else first_map_number)
                if neighbour not in molecule_map_numbers:
                    molecule_map_numbers.add(neighbour)
                    map_numbers_to_visit.append(neighbour)
    return molecule_map_numbers


def apply_species_change(graph: StateGraph, added_species: Optional[StateGraph],
                         removed_fragment_map_numbers: Sequence[int]) -> StateGraph:
    """The state with `added_species` added and, for each map number in
    `removed_fragment_map_numbers`, the whole molecule containing that atom removed.
    Raises SpeciesChangeError."""
    removed_map_numbers: Set[int] = set()
    for map_number in removed_fragment_map_numbers:
        if map_number not in graph.map_number_to_atom:
            raise SpeciesChangeError(
                "removed-map-number-absent", f"map number {map_number} is not in the state")
        removed_map_numbers |= _molecule_map_numbers(graph, map_number)
    map_number_to_atom = {map_number: atom for map_number, atom in graph.map_number_to_atom.items()
                          if map_number not in removed_map_numbers}
    bond_to_order = {key: order for key, order in graph.bond_to_order.items()
                     if not set(key) & removed_map_numbers}
    if added_species is not None:
        for map_number, atom in added_species.map_number_to_atom.items():
            if map_number in graph.map_number_to_atom:
                raise SpeciesChangeError(
                    "added-map-number-in-use", f"map number {map_number} is already in the state")
            map_number_to_atom[map_number] = atom
        bond_to_order.update(added_species.bond_to_order)
    return StateGraph(map_number_to_atom, bond_to_order)
