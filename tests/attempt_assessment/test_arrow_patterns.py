"""Tests for arrow_patterns.py against the shared cases in
fixtures/assessment/arrow_pattern_cases.json (the TypeScript twin runs the same cases); every
pattern in the example reactions must parse."""
import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

import pytest
from arrow_notation.curved_arrow_notation import parse_curved_arrow
from attempt_assessment.arrow_patterns import (
    ArrowPatternError,
    arrow_pattern_matches,
    parse_arrow_pattern,
)

FIXTURES_FOLDER = Path(__file__).resolve().parents[2] / "fixtures"
PATTERN_CASES: Dict[str, Any] = json.loads(
    (FIXTURES_FOLDER / "assessment" / "arrow_pattern_cases.json").read_text(encoding="utf-8"))
ROLES: Dict[str, List[int]] = PATTERN_CASES["atomRoleToMapNumbers"]
MATCH_CASES: List[Dict[str, Any]] = PATTERN_CASES["matchCases"]
INVALID_PATTERNS: List[Dict[str, Any]] = PATTERN_CASES["invalidPatterns"]


def example_patterns() -> List[Tuple[str, Dict[str, List[int]]]]:
    """(arrowPattern, the reaction's roles) for every misconception in the example reactions."""
    patterns = []
    for reaction_path in sorted((FIXTURES_FOLDER / "reactions").glob("*.json")):
        reaction_document = json.loads(reaction_path.read_text(encoding="utf-8"))
        for state in reaction_document["stateIdToState"].values():
            for misconception in state.get("misconceptions", []):
                patterns.append((misconception["arrowPattern"],
                                 reaction_document["atomRoleToMapNumbers"]))
    return patterns


EXAMPLE_PATTERNS = example_patterns()


@pytest.mark.parametrize("case", MATCH_CASES, ids=[case["caseName"] for case in MATCH_CASES])
def test_pattern_match(case: Dict[str, Any]) -> None:
    arrow_pattern = parse_arrow_pattern(case["arrowPattern"], ROLES)
    learner_arrows = [parse_curved_arrow(notation) for notation in case["learnerArrows"]]
    assert arrow_pattern_matches(arrow_pattern, learner_arrows) is case["expectedMatch"]


@pytest.mark.parametrize("case", INVALID_PATTERNS,
                         ids=[case["caseName"] for case in INVALID_PATTERNS])
def test_invalid_pattern_is_refused_with_the_expected_code(case: Dict[str, Any]) -> None:
    with pytest.raises(ArrowPatternError) as raised:
        parse_arrow_pattern(case["arrowPattern"], ROLES)
    assert raised.value.error_code == case["expectedErrorCode"]


@pytest.mark.parametrize("arrow_pattern_text, roles", EXAMPLE_PATTERNS,
                         ids=[text for text, _ in EXAMPLE_PATTERNS])
def test_every_example_pattern_parses(arrow_pattern_text: str, roles: Dict[str, List[int]]) -> None:
    parse_arrow_pattern(arrow_pattern_text, roles)
