"""Tests for skeleton_symmetry.py and resonance_equivalence.py.

Expected symmetry counts are worked out by hand in fixtures/assessment/skeleton_symmetry_cases.json;
expected comparisons are in fixtures/assessment/resonance_cases.json. The TypeScript twins run the
same cases.
"""
import json
from pathlib import Path
from typing import Any, Dict, List

import pytest
from arrow_notation.curved_arrow_notation import format_curved_arrow, parse_curved_arrow
from attempt_assessment.resonance_equivalence import charged_atom_count, compare_states
from attempt_assessment.skeleton_symmetry import (
    relabel_curved_arrow,
    relabel_state_graph,
    skeleton_symmetries,
)
from state_graphs.mapped_smiles_reading import state_graph_from_mapped_smiles
from state_graphs.state_graph import state_graph_to_json

ASSESSMENT_FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "assessment"
SYMMETRY_CASES: List[Dict[str, Any]] = json.loads(
    (ASSESSMENT_FIXTURES / "skeleton_symmetry_cases.json").read_text(encoding="utf-8"))["cases"]
RESONANCE_CASES: List[Dict[str, Any]] = json.loads(
    (ASSESSMENT_FIXTURES / "resonance_cases.json").read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", SYMMETRY_CASES, ids=[case["caseName"] for case in SYMMETRY_CASES])
def test_symmetry_count(case: Dict[str, Any]) -> None:
    graph = state_graph_from_mapped_smiles(case["mappedSmiles"])
    assert len(skeleton_symmetries(graph)) == case["expectedSymmetryCount"]


def test_identity_comes_first_and_every_symmetry_is_a_bijection() -> None:
    graph = state_graph_from_mapped_smiles("[CH:1]1=[CH:2][CH:3]=[CH:4][CH:5]=[CH:6]1")
    symmetries = skeleton_symmetries(graph)
    assert symmetries[0] == {map_number: map_number for map_number in range(1, 7)}
    assert all(sorted(symmetry.values()) == list(range(1, 7)) for symmetry in symmetries)


def test_above_the_cap_only_the_identity_is_returned() -> None:
    graph = state_graph_from_mapped_smiles("[CH:1]1=[CH:2][CH:3]=[CH:4][CH:5]=[CH:6]1")
    assert skeleton_symmetries(graph, maximum_symmetries=5) == [
        {map_number: map_number for map_number in range(1, 7)}]


def test_relabel_state_graph_moves_electrons_and_bonds_with_the_atoms() -> None:
    water = state_graph_from_mapped_smiles("[H:2][O:1][H:4].[H+:7]")
    swapped = relabel_state_graph(water, {1: 1, 2: 7, 4: 4, 7: 2})
    expected = state_graph_from_mapped_smiles("[H:7][O:1][H:4].[H+:2]")
    assert state_graph_to_json(swapped) == state_graph_to_json(expected)


def test_relabel_curved_arrow_re_sorts_bond_atoms() -> None:
    curved_arrow = parse_curved_arrow("σ O1-H4 -> lp O1")
    relabelled = relabel_curved_arrow(curved_arrow, {1: 5, 4: 2})
    assert format_curved_arrow(relabelled) == "σ H2-O5 -> lp O5"


@pytest.mark.parametrize("case", RESONANCE_CASES,
                         ids=[case["caseName"] for case in RESONANCE_CASES])
def test_state_comparison(case: Dict[str, Any]) -> None:
    result = state_graph_from_mapped_smiles(case["resultSmiles"])
    target = state_graph_from_mapped_smiles(case["targetSmiles"])
    assert str(compare_states(result, target)) == case["expectedComparison"]


def test_charged_atom_count() -> None:
    assert charged_atom_count(state_graph_from_mapped_smiles("[CH2+:1][O-:2].[Na+:3]")) == 3
    assert charged_atom_count(state_graph_from_mapped_smiles("[CH2:1]=[O:2]")) == 0
