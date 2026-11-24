"""Tests for python/reaction_files/state_atom_consistency.py.

The consistent documents are the example reactions in fixtures/reactions. Each inconsistent one
changes a single state of the SN2 example (map numbers: O1 hydroxide oxygen, C2 carbon, Br3, Na4).
"""
import copy
import json
from pathlib import Path
from typing import Any, Dict, List

import pytest
from reaction_files.state_atom_consistency import state_atom_problems

REACTIONS_FOLDER = Path(__file__).resolve().parents[2] / "fixtures" / "reactions"
EXAMPLE_REACTION_FILES = sorted(REACTIONS_FOLDER.glob("*.json"))


def sn2_example() -> Dict[str, Any]:
    reaction_path = REACTIONS_FOLDER / "sn2-hydroxide-bromomethane.json"
    document: Dict[str, Any] = json.loads(reaction_path.read_text(encoding="utf-8"))
    return copy.deepcopy(document)


def sn2_with_products_state(mapped_smiles: str, coordinate_keys: List[str]) -> Dict[str, Any]:
    """The SN2 example with its products state replaced by `mapped_smiles`, with a dummy
    coordinate for each of `coordinate_keys`."""
    document = sn2_example()
    products_state = document["stateIdToState"]["products"]
    products_state["mappedSmiles"] = mapped_smiles
    products_state["mapNumberToCoordinates"] = {key: [0.0, 0.0] for key in coordinate_keys}
    return document


@pytest.mark.parametrize("reaction_path", EXAMPLE_REACTION_FILES, ids=lambda path: path.stem)
def test_example_reaction_states_are_consistent(reaction_path: Path) -> None:
    document = json.loads(reaction_path.read_text(encoding="utf-8"))
    assert state_atom_problems(document) == []


def test_unreadable_smiles_is_reported() -> None:
    document = sn2_with_products_state("[OH:1][CH3:2(", ["1", "2"])
    problems = state_atom_problems(document)
    assert len(problems) == 1
    assert problems[0].startswith("state products: ")
    assert "cannot be read" in problems[0]


def test_atom_without_map_number_is_reported() -> None:
    # The bromide has lost its map number.
    document = sn2_with_products_state("[OH:1][CH3:2].[Br-].[Na+:4]", ["1", "2", "4"])
    assert state_atom_problems(document) == ["state products: an atom Br has no map number"]


def test_map_number_used_twice_in_one_state_is_reported() -> None:
    document = sn2_with_products_state("[OH:1][CH3:2].[Br-:2].[Na+:4]", ["1", "2", "4"])
    problems = state_atom_problems(document)
    assert "state products: map number 2 is used more than once" in problems


def test_map_number_changing_element_between_states_is_reported() -> None:
    # Map number 3 is Br in the reactants but Cl here.
    document = sn2_with_products_state("[OH:1][CH3:2].[Cl-:3].[Na+:4]", ["1", "2", "3", "4"])
    assert state_atom_problems(document) == [
        "state products: map number 3 is Cl here but Br in state reactants"]


def test_missing_coordinates_are_reported() -> None:
    document = sn2_with_products_state("[OH:1][CH3:2].[Br-:3].[Na+:4]", ["1", "2", "4"])
    assert state_atom_problems(document) == ["state products: no coordinates for map number 3"]


def test_coordinates_for_an_absent_map_number_are_reported() -> None:
    document = sn2_with_products_state("[OH:1][CH3:2].[Br-:3].[Na+:4]", ["1", "2", "3", "4", "9"])
    assert state_atom_problems(document) == [
        "state products: coordinates for map number 9, which is not in the state"]


def test_explicit_mapped_hydrogens_are_kept_and_need_coordinates() -> None:
    # [H:5] is an explicit, mapped hydrogen: it is an atom of the state like any other.
    document = sn2_with_products_state("[H:5][O:1][CH3:2].[Br-:3].[Na+:4]", ["1", "2", "3", "4"])
    assert state_atom_problems(document) == ["state products: no coordinates for map number 5"]
