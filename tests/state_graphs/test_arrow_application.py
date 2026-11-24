"""Tests for python/state_graphs/arrow_application.py.

The shared cases in fixtures/state_graphs/arrow_application_cases.json are the reference (the
TypeScript tests run them too). The strongest check is the last group: every step of the four
example reactions, applied to its from-state, must give exactly its to-state.
"""
import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

import pytest
from arrow_notation.curved_arrow_notation import parse_curved_arrow
from state_graphs.arrow_application import (
    ArrowApplicationError,
    SpeciesChangeError,
    apply_curved_arrows,
    apply_species_change,
)
from state_graphs.mapped_smiles_reading import state_graph_from_mapped_smiles
from state_graphs.state_graph import StateGraph, state_graph_to_json

FIXTURES_FOLDER = Path(__file__).resolve().parents[2] / "fixtures"
APPLICATION_CASES: Dict[str, Any] = json.loads(
    (FIXTURES_FOLDER / "state_graphs" / "arrow_application_cases.json").read_text(encoding="utf-8"))
VALID_CASES: List[Dict[str, Any]] = APPLICATION_CASES["validCases"]
INVALID_CASES: List[Dict[str, Any]] = APPLICATION_CASES["invalidCases"]


def example_steps() -> List[Tuple[str, Dict[str, Any], Dict[str, Any]]]:
    """(test id, reaction document, step) for every step of every example reaction."""
    steps = []
    for reaction_path in sorted((FIXTURES_FOLDER / "reactions").glob("*.json")):
        reaction_document = json.loads(reaction_path.read_text(encoding="utf-8"))
        for step in reaction_document["steps"]:
            steps.append((f"{reaction_path.stem}/{step['stepKey']}", reaction_document, step))
    return steps


EXAMPLE_STEPS = example_steps()


def state_of(reaction_document: Dict[str, Any], state_id: str) -> StateGraph:
    return state_graph_from_mapped_smiles(
        reaction_document["stateIdToState"][state_id]["mappedSmiles"])


def apply_arrow_notation(mapped_smiles: str, notations: List[str]) -> StateGraph:
    curved_arrows = [parse_curved_arrow(notation) for notation in notations]
    return apply_curved_arrows(state_graph_from_mapped_smiles(mapped_smiles), curved_arrows)


@pytest.mark.parametrize("case", VALID_CASES, ids=[case["caseName"] for case in VALID_CASES])
def test_arrows_give_the_expected_state(case: Dict[str, Any]) -> None:
    applied = apply_arrow_notation(case["mappedSmiles"], case["curvedArrows"])
    expected = state_graph_from_mapped_smiles(case["expectedMappedSmiles"])
    assert state_graph_to_json(applied) == state_graph_to_json(expected)


@pytest.mark.parametrize("case", INVALID_CASES, ids=[case["caseName"] for case in INVALID_CASES])
def test_arrows_are_refused_with_the_expected_rule(case: Dict[str, Any]) -> None:
    with pytest.raises(ArrowApplicationError) as raised:
        apply_arrow_notation(case["mappedSmiles"], case["curvedArrows"])
    assert raised.value.generic_rule_id == case["expectedRuleId"]


def test_applying_arrows_leaves_the_input_state_unchanged() -> None:
    before = state_graph_from_mapped_smiles("[OH-:1].[CH3:2][Br:3]")
    before_json = state_graph_to_json(before)
    apply_curved_arrows(before, [parse_curved_arrow("lp O1 -> σ O1-C2"),
                                 parse_curved_arrow("σ C2-Br3 -> lp Br3")])
    assert state_graph_to_json(before) == before_json


@pytest.mark.parametrize("test_id, reaction_document, step", EXAMPLE_STEPS,
                         ids=[test_id for test_id, _, _ in EXAMPLE_STEPS])
def test_example_step_reproduces_its_to_state(test_id: str, reaction_document: Dict[str, Any],
                                              step: Dict[str, Any]) -> None:
    from_state = state_of(reaction_document, step["fromStateId"])
    if step["stepKind"] == "change":
        added_species = (state_graph_from_mapped_smiles(step["addedSpecies"])
                         if "addedSpecies" in step else None)
        result = apply_species_change(from_state, added_species,
                                      step.get("removedFragmentMapNumbers", []))
    else:
        result = apply_curved_arrows(
            from_state, [parse_curved_arrow(notation) for notation in step["canonicalArrows"]])
    to_state = state_of(reaction_document, step["toStateId"])
    assert state_graph_to_json(result) == state_graph_to_json(to_state), test_id


def test_species_change_adds_and_removes_whole_molecules() -> None:
    before = state_graph_from_mapped_smiles("[OH2:1].[CH3:2][Br:3].[Na+:4]")
    added = state_graph_from_mapped_smiles("[CH3:8][CH:9]=[O:10]")
    # Map number 3 is in the bromomethane molecule, so map number 2 goes with it.
    result = apply_species_change(before, added, [3])
    expected = state_graph_from_mapped_smiles("[OH2:1].[Na+:4].[CH3:8][CH:9]=[O:10]")
    assert state_graph_to_json(result) == state_graph_to_json(expected)


def test_species_change_refuses_an_added_map_number_already_in_use() -> None:
    before = state_graph_from_mapped_smiles("[OH2:1]")
    with pytest.raises(SpeciesChangeError) as raised:
        apply_species_change(before, state_graph_from_mapped_smiles("[CH4:1]"), [])
    assert raised.value.error_code == "added-map-number-in-use"


def test_species_change_refuses_removing_an_absent_map_number() -> None:
    before = state_graph_from_mapped_smiles("[OH2:1]")
    with pytest.raises(SpeciesChangeError) as raised:
        apply_species_change(before, None, [7])
    assert raised.value.error_code == "removed-map-number-absent"
