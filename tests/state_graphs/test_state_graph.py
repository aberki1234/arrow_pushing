"""Tests for python/state_graphs/state_graph.py: the derived electron counts.

Each graph is built by hand, so these tests do not depend on SMILES reading. Expected values are
counted from Lewis structures: e.g. hydroxide has three lone pairs and a charge of -1.
"""
from state_graphs.state_graph import (
    StateAtom,
    StateGraph,
    bond_key,
    bond_order_sum,
    formal_charge,
    lone_pair_count,
    maximum_valence_shell_electrons,
    state_graph_to_json,
    unpaired_electron_count,
    valence_shell_electron_count,
)

HYDROXIDE = StateGraph({1: StateAtom(1, "O", hydrogen_count=1, nonbonding_electron_count=6)}, {})
BROMINE_RADICAL = StateGraph({1: StateAtom(1, "Br", 0, 7)}, {})
# The ylide [CH2-:2][P+:1](C)(C)C, with the three methyls as map numbers 11-13.
PHOSPHONIUM_YLIDE = StateGraph(
    {1: StateAtom(1, "P", 0, 0), 2: StateAtom(2, "C", 2, 2),
     11: StateAtom(11, "C", 3, 0), 12: StateAtom(12, "C", 3, 0), 13: StateAtom(13, "C", 3, 0)},
    {(1, 2): 1, (1, 11): 1, (1, 12): 1, (1, 13): 1})


def test_bond_key_puts_the_smaller_map_number_first() -> None:
    assert bond_key(5, 3) == (3, 5)
    assert bond_key(3, 5) == (3, 5)


def test_hydroxide_has_three_lone_pairs_charge_minus_one_and_an_octet() -> None:
    oxygen = HYDROXIDE.map_number_to_atom[1]
    assert formal_charge(HYDROXIDE, 1) == -1
    assert lone_pair_count(oxygen) == 3
    assert unpaired_electron_count(oxygen) == 0
    assert valence_shell_electron_count(HYDROXIDE, 1) == 8


def test_bromine_radical_has_three_lone_pairs_and_one_unpaired_electron() -> None:
    bromine = BROMINE_RADICAL.map_number_to_atom[1]
    assert formal_charge(BROMINE_RADICAL, 1) == 0
    assert lone_pair_count(bromine) == 3
    assert unpaired_electron_count(bromine) == 1
    assert valence_shell_electron_count(BROMINE_RADICAL, 1) == 7


def test_ylide_charges_come_from_the_electron_counts() -> None:
    assert bond_order_sum(PHOSPHONIUM_YLIDE, 1) == 4
    assert formal_charge(PHOSPHONIUM_YLIDE, 1) == 1
    assert formal_charge(PHOSPHONIUM_YLIDE, 2) == -1
    assert lone_pair_count(PHOSPHONIUM_YLIDE.map_number_to_atom[2]) == 1


def test_maximum_valence_shell_is_duet_octet_or_expanded_by_period() -> None:
    assert maximum_valence_shell_electrons("H") == 2
    assert maximum_valence_shell_electrons("C") == 8
    assert maximum_valence_shell_electrons("O") == 8
    assert maximum_valence_shell_electrons("P") == 12
    assert maximum_valence_shell_electrons("Br") == 12


def test_state_graph_to_json_sorts_atoms_and_bonds() -> None:
    assert state_graph_to_json(PHOSPHONIUM_YLIDE)["atoms"][0] == {
        "mapNumber": 1, "element": "P", "hydrogenCount": 0, "nonbondingElectronCount": 0}
    assert [bond["mapNumbers"] for bond in state_graph_to_json(PHOSPHONIUM_YLIDE)["bonds"]] == [
        [1, 2], [1, 11], [1, 12], [1, 13]]
