"""Tests for python/reaction_files/schema_violations.py.

The valid documents are the example reactions in fixtures/reactions. The invalid ones are made from
them by the shared edits in fixtures/schema_cases/invalid_edits.json, which the TypeScript tests
run too, so both validators must report the same instance paths.
"""
import copy
import json
from pathlib import Path
from typing import Any, Dict, List

import pytest
from jsonschema import Draft202012Validator
from reaction_files.schema_violations import load_reaction_schema, schema_violations

FIXTURES_FOLDER = Path(__file__).resolve().parents[2] / "fixtures"
EXAMPLE_REACTION_FILES = sorted((FIXTURES_FOLDER / "reactions").glob("*.json"))
INVALID_EDIT_CASES: List[Dict[str, Any]] = json.loads(
    (FIXTURES_FOLDER / "schema_cases" / "invalid_edits.json").read_text(encoding="utf-8"))["cases"]


def load_example_reaction(file_name: str) -> Dict[str, Any]:
    reaction_path = FIXTURES_FOLDER / "reactions" / file_name
    document: Dict[str, Any] = json.loads(reaction_path.read_text(encoding="utf-8"))
    return document


def apply_edit(document: Dict[str, Any], edit_case: Dict[str, Any]) -> Dict[str, Any]:
    """A copy of `document` with the case's one edit applied: set `newValue` at `pathToSet`, or
    delete the key at `pathToDelete`. A path is a list of keys and list positions."""
    edited_document = copy.deepcopy(document)
    path = edit_case.get("pathToSet") or edit_case["pathToDelete"]
    container: Any = edited_document
    for key_or_position in path[:-1]:
        container = container[key_or_position]
    if "pathToSet" in edit_case:
        container[path[-1]] = edit_case["newValue"]
    else:
        del container[path[-1]]
    return edited_document


def test_the_four_example_reactions_are_present() -> None:
    assert [path.name for path in EXAMPLE_REACTION_FILES] == [
        "aldol-addition-base.json", "radical-bromination-methane.json",
        "sn2-hydroxide-bromomethane.json", "wittig-methylenation-cyclohexanone.json"]


def test_reaction_schema_is_a_valid_draft_2020_12_schema() -> None:
    Draft202012Validator.check_schema(load_reaction_schema())


@pytest.mark.parametrize("reaction_path", EXAMPLE_REACTION_FILES, ids=lambda path: path.stem)
def test_example_reaction_has_no_schema_violations(reaction_path: Path) -> None:
    assert schema_violations(load_example_reaction(reaction_path.name)) == []


@pytest.mark.parametrize("edit_case", INVALID_EDIT_CASES,
                         ids=[case["caseName"] for case in INVALID_EDIT_CASES])
def test_invalid_edit_is_reported_at_the_expected_path(edit_case: Dict[str, Any]) -> None:
    edited_document = apply_edit(load_example_reaction(edit_case["baseReactionFile"]), edit_case)
    reported_paths = [violation.instance_path for violation in schema_violations(edited_document)]
    assert edit_case["expectedViolationPath"] in reported_paths


def test_violations_are_sorted_by_instance_path() -> None:
    document = load_example_reaction("sn2-hydroxide-bromomethane.json")
    document["difficultyTier"] = 9
    document["licence"] = "MIT"
    reported_paths = [violation.instance_path for violation in schema_violations(document)]
    assert reported_paths == sorted(reported_paths)
    assert {"/difficultyTier", "/licence"} <= set(reported_paths)


def test_every_violation_has_a_message() -> None:
    document = load_example_reaction("sn2-hydroxide-bromomethane.json")
    document["formatVersion"] = 2
    assert all(violation.message for violation in schema_violations(document))
