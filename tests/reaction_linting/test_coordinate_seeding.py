"""Tests for coordinate_seeding.py.

The independent reference for distances is RDKit's depiction convention: a bond is drawn 1.5
units long (rdDepictor's default bond length). The tolerance, 0.02, allows for the rounding of
each coordinate to 0.01 and for slightly stretched bonds in rings.
"""
import json
import math
from pathlib import Path
from typing import Any, Dict

import pytest
from reaction_linting.coordinate_seeding import seed_missing_coordinates, seeded_coordinates

FIXTURES_FOLDER = Path(__file__).resolve().parents[2] / "fixtures"
RDKIT_BOND_LENGTH = 1.5
BOND_LENGTH_TOLERANCE = 0.02


def load_sn2_reaction() -> Dict[str, Any]:
    reaction_document: Dict[str, Any] = json.loads(
        (FIXTURES_FOLDER / "reactions" / "sn2-hydroxide-bromomethane.json").read_text(
            encoding="utf-8"))
    return reaction_document


def test_seeded_coordinates_cover_every_mapped_atom_including_explicit_hydrogen() -> None:
    coordinates = seeded_coordinates("[H:2][O-:1].[H:4][CH2:3][CH:5]=[O:6]")
    assert sorted(coordinates, key=int) == ["1", "2", "3", "4", "5", "6"]
    assert all(len(position) == 2 for position in coordinates.values())


def test_bonded_atoms_are_one_bond_length_apart() -> None:
    coordinates = seeded_coordinates("[CH3:1][CH2:2][OH:3]")
    for first_key, second_key in (("1", "2"), ("2", "3")):
        distance = math.dist(coordinates[first_key], coordinates[second_key])
        assert distance == pytest.approx(RDKIT_BOND_LENGTH, abs=BOND_LENGTH_TOLERANCE)


def test_coordinates_are_rounded() -> None:
    coordinates = seeded_coordinates("[CH3:1][CH2:2][OH:3]")
    assert all(round(value, 2) == value for position in coordinates.values()
               for value in position)


def test_unreadable_smiles_raises_value_error() -> None:
    with pytest.raises(ValueError):
        seeded_coordinates("[CH3:1](")


def test_only_states_with_missing_or_stale_coordinates_are_seeded() -> None:
    reaction_document = load_sn2_reaction()
    reactant_coordinates = dict(reaction_document["stateIdToState"]["reactants"][
        "mapNumberToCoordinates"])
    del reaction_document["stateIdToState"]["products"]["mapNumberToCoordinates"]["4"]
    assert seed_missing_coordinates(reaction_document) == ["products"]
    states = reaction_document["stateIdToState"]
    assert states["reactants"]["mapNumberToCoordinates"] == reactant_coordinates
    assert sorted(states["products"]["mapNumberToCoordinates"], key=int) == ["1", "2", "3", "4"]


def test_a_state_without_the_coordinates_key_is_seeded() -> None:
    reaction_document = load_sn2_reaction()
    del reaction_document["stateIdToState"]["reactants"]["mapNumberToCoordinates"]
    assert seed_missing_coordinates(reaction_document) == ["reactants"]
    assert "mapNumberToCoordinates" in reaction_document["stateIdToState"]["reactants"]


def test_a_state_with_unreadable_smiles_is_skipped() -> None:
    reaction_document = load_sn2_reaction()
    reaction_document["stateIdToState"]["products"]["mappedSmiles"] = "[OH:1]("
    reaction_document["stateIdToState"]["products"]["mapNumberToCoordinates"] = {}
    assert seed_missing_coordinates(reaction_document) == []


def test_a_clean_reaction_is_left_unchanged() -> None:
    reaction_document = load_sn2_reaction()
    assert seed_missing_coordinates(reaction_document) == []
    assert reaction_document == load_sn2_reaction()
