"""Skeleton symmetries of a state, and relabelling a state or an arrow by one of them.

Purpose
    Equivalent atoms must not need listing in content: either hydrogen of water, any of three
    alpha hydrogens, either carboxylate oxygen. A skeleton symmetry is a reordering of a state's
    atoms that maps its sigma skeleton onto itself; relabelling a learner's result (or arrows) by
    each symmetry and comparing again accepts every equivalent answer.

Terms (docs/schema-design.md section 0)
    sigma skeleton      atoms, each with its element and implicit hydrogen count, and which pairs
                        are bonded (bond orders, charges and lone pairs ignored, so atoms that
                        differ only by resonance count as equivalent)
    skeleton symmetry   a mapping old map number -> new map number that keeps every atom's element
                        and hydrogen count and maps bonded pairs to bonded pairs (an automorphism)

Steps
    1. skeleton_symmetries() lists them by backtracking over atoms in map-number order, trying for
       each atom the unused atoms with the same element, hydrogen count and number of bonds, and
       keeping bonds to atoms already placed. The identity comes first.
    2. relabel_state_graph() and relabel_curved_arrow() apply one symmetry.
Molecules here are small (the Wittig reactants have 96 symmetries). Above
MAXIMUM_SKELETON_SYMMETRIES, a safety cap rather than a chemistry number, only the identity is
returned, so answers are then compared without symmetry.
"""
from dataclasses import dataclass, replace
from typing import Dict, List, Set, Tuple

from arrow_notation.curved_arrow_notation import AtomLabel, CurvedArrow, ElectronLocus
from state_graphs.state_graph import StateGraph, bond_key

MAXIMUM_SKELETON_SYMMETRIES = 10_000

# An atom's element, implicit hydrogen count and number of bonded neighbours: a symmetry can
# only map an atom onto an atom with the same signature.
AtomSignature = Tuple[str, int, int]


@dataclass
class _SymmetrySearch:
    """What the backtracking search shares: the atoms in the order they are placed, each atom's
    neighbours and signature, and the symmetries found so far."""
    map_numbers: List[int]
    map_number_to_neighbours: Dict[int, Set[int]]
    map_number_to_signature: Dict[int, AtomSignature]
    maximum_symmetries: int
    symmetries_found: List[Dict[int, int]]


def _keeps_bonds(search: _SymmetrySearch, atom: int, candidate: int,
                 placed: Dict[int, int]) -> bool:
    """Mapping `atom` onto `candidate` keeps every bond (and non-bond) to the atoms placed so
    far."""
    atom_neighbours = search.map_number_to_neighbours[atom]
    candidate_neighbours = search.map_number_to_neighbours[candidate]
    return all((placed_atom in atom_neighbours) == (image in candidate_neighbours)
               for placed_atom, image in placed.items())


def _extend(search: _SymmetrySearch, placed: Dict[int, int], used_images: Set[int]) -> bool:
    """Place the next atom in every possible way. Returns False once the cap is passed."""
    if len(placed) == len(search.map_numbers):
        search.symmetries_found.append(dict(placed))
        return len(search.symmetries_found) <= search.maximum_symmetries
    atom = search.map_numbers[len(placed)]
    # Trying the atom itself first makes the identity the first symmetry found.
    candidates = [atom] + [other for other in search.map_numbers if other != atom]
    for candidate in candidates:
        if (candidate in used_images
                or search.map_number_to_signature[candidate] != search.map_number_to_signature[atom]
                or not _keeps_bonds(search, atom, candidate, placed)):
            continue
        placed[atom] = candidate
        used_images.add(candidate)
        within_cap = _extend(search, placed, used_images)
        del placed[atom]
        used_images.discard(candidate)
        if not within_cap:
            return False
    return True


def skeleton_symmetries(graph: StateGraph,
                        maximum_symmetries: int = MAXIMUM_SKELETON_SYMMETRIES
                        ) -> List[Dict[int, int]]:
    """Every skeleton symmetry of `graph` as {old map number: new map number}, the identity first.
    If there are more than `maximum_symmetries`, only the identity."""
    map_numbers = sorted(graph.map_number_to_atom)
    map_number_to_neighbours: Dict[int, Set[int]] = {
        map_number: set() for map_number in map_numbers}
    for first_map_number, second_map_number in graph.bond_to_order:
        map_number_to_neighbours[first_map_number].add(second_map_number)
        map_number_to_neighbours[second_map_number].add(first_map_number)
    map_number_to_signature = {
        map_number: (atom.element, atom.hydrogen_count, len(map_number_to_neighbours[map_number]))
        for map_number, atom in graph.map_number_to_atom.items()}
    search = _SymmetrySearch(map_numbers, map_number_to_neighbours, map_number_to_signature,
                             maximum_symmetries, [])
    within_cap = _extend(search, {}, set())
    identity = {map_number: map_number for map_number in map_numbers}
    return search.symmetries_found if within_cap else [identity]


def relabel_state_graph(graph: StateGraph, map_number_to_new_map_number: Dict[int, int]
                        ) -> StateGraph:
    """The same state with every atom renumbered; electrons and bond orders move with the atoms."""
    map_number_to_atom = {
        map_number_to_new_map_number[map_number]: replace(
            atom, map_number=map_number_to_new_map_number[map_number])
        for map_number, atom in graph.map_number_to_atom.items()}
    bond_to_order = {
        bond_key(map_number_to_new_map_number[first], map_number_to_new_map_number[second]): order
        for (first, second), order in graph.bond_to_order.items()}
    return StateGraph(map_number_to_atom, bond_to_order)


def _relabel_locus(locus: ElectronLocus, map_number_to_new_map_number: Dict[int, int]
                   ) -> ElectronLocus:
    """Atoms not in the relabelling keep their map numbers."""
    relabelled_atoms = [
        AtomLabel(atom.element, map_number_to_new_map_number.get(atom.map_number, atom.map_number))
        for atom in locus.atoms]
    return ElectronLocus(locus.locus_kind,
                         tuple(sorted(relabelled_atoms, key=lambda atom: atom.map_number)))


def relabel_curved_arrow(curved_arrow: CurvedArrow, map_number_to_new_map_number: Dict[int, int]
                         ) -> CurvedArrow:
    """The same arrow with its atoms renumbered (bond atoms re-sorted by map number)."""
    return CurvedArrow(
        source=_relabel_locus(curved_arrow.source, map_number_to_new_map_number),
        destination=_relabel_locus(curved_arrow.destination, map_number_to_new_map_number),
        electrons_moved=curved_arrow.electrons_moved)
