"""Compare a learner's result state with a target state, accepting resonance forms (decision Q1).

Rule (docs/schema-design.md section 4, point 4)
    Two drawings are resonance forms of each other when everything that π and lone-pair arrows
    cannot change is the same: the atoms with their elements and hydrogen counts, which pairs are
    σ-bonded, and each molecule's charge and unpaired electrons. Bond orders, lone pairs and the
    charges of single atoms may differ. Both drawings already passed the octet check, so the
    electrons that differ can only move through conjugated atoms: no list of forms is needed,
    and the check is one pass over atoms and bonds.
    A form with more charged atoms than the target (e.g. C+ next to O- instead of C=O) is a
    minor, charge-separated form: the learner is shown it is not the drawing wanted.

Comparisons (StateComparison)
    identical             the same drawing
    resonanceForm         another resonance form, with no more charged atoms
    minorResonanceForm    a resonance form with more charged atoms than the target
    different             not a resonance form of the target
"""
from enum import StrEnum
from typing import List, Set

from state_graphs.state_graph import (
    StateGraph,
    formal_charge,
    state_graph_to_json,
    unpaired_electron_count,
)


class StateComparison(StrEnum):
    """The values are the JSON spellings used in fixtures and in TypeScript."""
    IDENTICAL = "identical"
    RESONANCE_FORM = "resonanceForm"
    MINOR_RESONANCE_FORM = "minorResonanceForm"
    DIFFERENT = "different"


def charged_atom_count(graph: StateGraph) -> int:
    """How many atoms have a nonzero formal charge."""
    return sum(1 for map_number in graph.map_number_to_atom
               if formal_charge(graph, map_number) != 0)


def _molecules(graph: StateGraph) -> List[Set[int]]:
    """The map numbers of each molecule (connected fragment), each list sorted by first atom."""
    unvisited = set(graph.map_number_to_atom)
    molecules: List[Set[int]] = []
    while unvisited:
        start_map_number = min(unvisited)
        molecule = {start_map_number}
        frontier = [start_map_number]
        while frontier:
            current = frontier.pop()
            for first_map_number, second_map_number in graph.bond_to_order:
                if current in (first_map_number, second_map_number):
                    neighbour = (second_map_number if current == first_map_number
                                 else first_map_number)
                    if neighbour not in molecule:
                        molecule.add(neighbour)
                        frontier.append(neighbour)
        molecules.append(molecule)
        unvisited -= molecule
    return molecules


def _same_sigma_skeleton(result: StateGraph, target: StateGraph) -> bool:
    """Same atoms with the same elements and hydrogen counts, and the same bonded pairs."""
    if set(result.map_number_to_atom) != set(target.map_number_to_atom):
        return False
    for map_number, target_atom in target.map_number_to_atom.items():
        result_atom = result.map_number_to_atom[map_number]
        if (result_atom.element, result_atom.hydrogen_count) != (
                target_atom.element, target_atom.hydrogen_count):
            return False
    return set(result.bond_to_order) == set(target.bond_to_order)


def _same_charge_and_unpaired_electrons_per_molecule(result: StateGraph,
                                                     target: StateGraph) -> bool:
    for molecule in _molecules(target):
        for count_of in (
                lambda graph, map_number: formal_charge(graph, map_number),
                lambda graph, map_number: unpaired_electron_count(
                    graph.map_number_to_atom[map_number])):
            if (sum(count_of(result, map_number) for map_number in molecule)
                    != sum(count_of(target, map_number) for map_number in molecule)):
                return False
    return True


def compare_states(result: StateGraph, target: StateGraph) -> StateComparison:
    """How `result` relates to `target`, with atoms compared by map number (no symmetry)."""
    if state_graph_to_json(result) == state_graph_to_json(target):
        return StateComparison.IDENTICAL
    if not (_same_sigma_skeleton(result, target)
            and _same_charge_and_unpaired_electrons_per_molecule(result, target)):
        return StateComparison.DIFFERENT
    if charged_atom_count(result) > charged_atom_count(target):
        return StateComparison.MINOR_RESONANCE_FORM
    return StateComparison.RESONANCE_FORM
