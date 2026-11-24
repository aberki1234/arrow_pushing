"""Tests for attempt_assessment.py against the shared cases in
fixtures/assessment/attempt_cases.json (the TypeScript twin runs the same cases).

Only the fields named in each case's expectedAssessment are compared; for a partial-progress
assessment, "hasAuthoredMessage" and "brokenRuleId" are derived from the assessment's JSON.
"""
import copy
import json
from pathlib import Path
from typing import Any, Dict, List

import pytest
from arrow_notation.curved_arrow_notation import parse_curved_arrow
from attempt_assessment.attempt_assessment import (
    PartialProgressAssessment,
    assess_attempt,
    assessment_to_json,
    prepare_reaction,
)

FIXTURES_FOLDER = Path(__file__).resolve().parents[2] / "fixtures"
ATTEMPT_CASES: List[Dict[str, Any]] = json.loads(
    (FIXTURES_FOLDER / "assessment" / "attempt_cases.json").read_text(encoding="utf-8"))["cases"]


def reaction_for_case(case: Dict[str, Any]) -> Dict[str, Any]:
    """The case's example reaction, with its extraMisconceptions appended to the state."""
    reaction_document: Dict[str, Any] = json.loads(
        (FIXTURES_FOLDER / "reactions" / case["reactionFile"]).read_text(encoding="utf-8"))
    reaction_document = copy.deepcopy(reaction_document)
    state = reaction_document["stateIdToState"][case["stateId"]]
    state["misconceptions"] = state.get("misconceptions", []) + case.get("extraMisconceptions", [])
    return reaction_document


def comparable_fields(assessment_json: Dict[str, Any]) -> Dict[str, Any]:
    """The assessment JSON plus the derived fields the fixture uses for partial progress."""
    fields = dict(assessment_json)
    if fields["assessmentKind"] == "partialProgress":
        fields["hasAuthoredMessage"] = fields["authoredMessage"] is not None
    return fields


@pytest.mark.parametrize("case", ATTEMPT_CASES, ids=[case["caseName"] for case in ATTEMPT_CASES])
def test_attempt_is_assessed_as_expected(case: Dict[str, Any]) -> None:
    prepared = prepare_reaction(reaction_for_case(case))
    learner_arrows = [parse_curved_arrow(notation) for notation in case["learnerArrows"]]
    fields = comparable_fields(assessment_to_json(
        assess_attempt(prepared, case["stateId"], learner_arrows)))
    expected = case["expectedAssessment"]
    assert {key: fields.get(key) for key in expected} == expected


def test_partial_progress_carries_the_broken_rule_message() -> None:
    """Both parts reach the screen: "right so far ... but carbon would have 10 electrons"."""
    prepared = prepare_reaction(reaction_for_case(
        {"reactionFile": "sn2-hydroxide-bromomethane.json", "stateId": "reactants"}))
    assessment = assess_attempt(prepared, "reactants", [parse_curved_arrow("lp O1 -> σ O1-C2")])
    assert isinstance(assessment, PartialProgressAssessment)
    assert assessment.authored_message is not None and "10 electrons" in assessment.authored_message
    assert assessment.broken_rule is not None
    assert "C2 would have 10 valence-shell electrons" in assessment.broken_rule.message


def test_a_state_left_only_by_a_change_step_cannot_be_assessed() -> None:
    prepared = prepare_reaction(reaction_for_case(
        {"reactionFile": "aldol-addition-base.json", "stateId": "enolate"}))
    with pytest.raises(ValueError, match="no arrow step"):
        assess_attempt(prepared, "enolate", [parse_curved_arrow("lp O6 -> π C5-O6")])
