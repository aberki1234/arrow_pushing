"""Tests for python/state_graphs/mapped_smiles_reading.py.

The shared cases in fixtures/state_graphs/mapped_smiles_cases.json are the reference; the
TypeScript reader (its own parser) runs the same cases, so RDKit here also checks that parser.
Every state of the four example reactions must be readable.
"""
import json
from pathlib import Path
from typing import Any, Dict, List

import pytest
from state_graphs.mapped_smiles_reading import MappedSmilesError, state_graph_from_mapped_smiles
from state_graphs.state_graph import state_graph_to_json

FIXTURES_FOLDER = Path(__file__).resolve().parents[2] / "fixtures"
SMILES_CASES: Dict[str, Any] = json.loads(
    (FIXTURES_FOLDER / "state_graphs" / "mapped_smiles_cases.json").read_text(encoding="utf-8"))
VALID_CASES: List[Dict[str, Any]] = SMILES_CASES["validCases"]
INVALID_CASES: List[Dict[str, Any]] = SMILES_CASES["invalidCases"]
EXAMPLE_STATE_SMILES = sorted({
    state["mappedSmiles"]
    for reaction_path in (FIXTURES_FOLDER / "reactions").glob("*.json")
    for state in json.loads(reaction_path.read_text(encoding="utf-8"))["stateIdToState"].values()})


@pytest.mark.parametrize("case", VALID_CASES, ids=[case["caseName"] for case in VALID_CASES])
def test_valid_smiles_gives_the_expected_graph(case: Dict[str, Any]) -> None:
    graph = state_graph_from_mapped_smiles(case["mappedSmiles"])
    assert state_graph_to_json(graph) == case["stateGraph"]


@pytest.mark.parametrize("case", INVALID_CASES, ids=[case["caseName"] for case in INVALID_CASES])
def test_invalid_smiles_is_refused_with_the_expected_code(case: Dict[str, Any]) -> None:
    with pytest.raises(MappedSmilesError) as raised:
        state_graph_from_mapped_smiles(case["mappedSmiles"])
    assert raised.value.error_code == case["expectedErrorCode"]


@pytest.mark.parametrize("mapped_smiles", EXAMPLE_STATE_SMILES)
def test_every_example_state_is_readable(mapped_smiles: str) -> None:
    state_graph_from_mapped_smiles(mapped_smiles)


def test_error_message_quotes_the_smiles() -> None:
    with pytest.raises(ValueError, match=r"\[CH5:1\]"):
        state_graph_from_mapped_smiles("[CH5:1]")
