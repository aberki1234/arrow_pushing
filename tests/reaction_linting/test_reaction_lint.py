"""Tests for reaction_lint.py and the rule modules it runs.

The four example reactions in fixtures/reactions must lint clean. Each case in
fixtures/lint_cases/reaction_edits.json edits one of them to break a rule, and names the rule ids
expected, worked out by hand from the rule definitions in docs/schema-design.md section 3.5.
"""
import copy
import json
from pathlib import Path
from typing import Any, Dict, List

import pytest
from reaction_linting.lint_findings import LintFinding, LintLevel, lint_finding_to_json
from reaction_linting.reaction_lint import lint_reaction

FIXTURES_FOLDER = Path(__file__).resolve().parents[2] / "fixtures"
EXAMPLE_REACTION_FILES = sorted((FIXTURES_FOLDER / "reactions").glob("*.json"))
LINT_CASES: List[Dict[str, Any]] = json.loads(
    (FIXTURES_FOLDER / "lint_cases" / "reaction_edits.json").read_text(encoding="utf-8"))["cases"]
WARNING_RULE_IDS = {"fewer-than-three-hint-tiers", "misconception-never-fires",
                    "too-many-skeleton-symmetries", "misconception-in-abbreviated-group"}


def load_example_reaction(file_name: str) -> Dict[str, Any]:
    reaction_document: Dict[str, Any] = json.loads(
        (FIXTURES_FOLDER / "reactions" / file_name).read_text(encoding="utf-8"))
    return reaction_document


def value_at(document: Any, path: List[Any]) -> Any:
    for key_or_position in path:
        document = document[key_or_position]
    return document


def apply_edits(document: Dict[str, Any], edits: List[Dict[str, Any]]) -> Dict[str, Any]:
    """A copy of `document` with each edit applied in order (see the fixture's description). A
    path is a list of keys and list positions; a position one past the end appends."""
    edited_document = copy.deepcopy(document)
    for edit in edits:
        path = edit.get("pathToSet") or edit["pathToDelete"]
        container = value_at(edited_document, path[:-1])
        if "pathToDelete" in edit:
            del container[path[-1]]
            continue
        new_value = (copy.deepcopy(value_at(edited_document, edit["copyFromPath"]))
                     if "copyFromPath" in edit else edit["newValue"])
        if isinstance(container, list) and path[-1] == len(container):
            container.append(new_value)
        else:
            container[path[-1]] = new_value
    return edited_document


def edited_reaction(case_name: str) -> Dict[str, Any]:
    case = next(case for case in LINT_CASES if case["caseName"] == case_name)
    return apply_edits(load_example_reaction(case["baseReactionFile"]), case["edits"])


@pytest.mark.parametrize("reaction_path", EXAMPLE_REACTION_FILES, ids=lambda path: path.stem)
def test_example_reaction_lints_clean(reaction_path: Path) -> None:
    assert lint_reaction(load_example_reaction(reaction_path.name)) == []


@pytest.mark.parametrize("case", LINT_CASES, ids=[case["caseName"] for case in LINT_CASES])
def test_edited_reaction_breaks_the_expected_rules(case: Dict[str, Any]) -> None:
    reaction_document = apply_edits(load_example_reaction(case["baseReactionFile"]),
                                    case["edits"])
    lint_findings = lint_reaction(reaction_document)
    assert sorted({finding.lint_rule_id for finding in lint_findings}) == (
        case["expectedLintRuleIds"])


@pytest.mark.parametrize("case", LINT_CASES, ids=[case["caseName"] for case in LINT_CASES])
def test_lint_level_follows_the_rule(case: Dict[str, Any]) -> None:
    reaction_document = apply_edits(load_example_reaction(case["baseReactionFile"]),
                                    case["edits"])
    for finding in lint_reaction(reaction_document):
        expected_level = (LintLevel.WARNING if finding.lint_rule_id in WARNING_RULE_IDS
                          else LintLevel.ERROR)
        assert finding.lint_level == expected_level, finding


def test_every_rule_id_has_a_lint_case() -> None:
    """Every rule the modules define, except the symmetry cap (tested below with a small cap,
    since no small molecule passes 10,000), is broken by at least one shared case."""
    covered = {rule_id for case in LINT_CASES for rule_id in case["expectedLintRuleIds"]}
    assert covered == {
        "schema-violation", "state-atoms-inconsistent", "mapped-smiles-not-supported",
        "step-state-id-unknown", "duplicate-step-key", "state-unreachable",
        "mechanism-has-cycle", "not-exactly-one-product-state",
        "several-preferred-steps-leave-state", "preferred-route-does-not-reach-product",
        "change-step-not-alone", "leaving-steps-reach-equivalent-states",
        "step-does-not-reproduce-to-state", "misconception-pattern-invalid",
        "duplicate-misconception-id", "misconception-hides-correct-answer",
        "misconception-never-fires", "learner-prompt-missing", "hint-tiers-missing",
        "fewer-than-three-hint-tiers", "abbreviated-group-atoms-unknown",
        "abbreviated-group-not-attached-once", "arrow-touches-abbreviated-group",
        "misconception-in-abbreviated-group"}


@pytest.mark.parametrize("case_name, expected_instance_paths", [
    ("step to an unknown state", ["/steps/0/toStateId"]),
    ("canonical arrows break the octet", ["/steps/0/canonicalArrows"]),
    ("partial arrow set is not a complete step", ["/steps/0/partialArrowSets/0"]),
    ("change step adds the wrong molecule", ["/steps/1"]),
    ("two steps share a step key", ["/steps/1/stepKey"]),
    ("misconception matches the canonical arrows", ["/stateIdToState/reactants/misconceptions/0"]),
    ("misconception covered by an earlier wider one",
     ["/stateIdToState/reactants/misconceptions/1"]),
    ("one hint tier only", ["/stateIdToState/reactants/hintTiers"]),
    ("no learner prompt where arrows are drawn", ["/stateIdToState/reactants"]),
    ("branch state no longer reachable", ["/stateIdToState/betaine"]),
    ("both Wittig routes preferred", ["/steps/1/routePreference"]),
    ("two leaving steps reach the same state drawn twice", ["/steps/4"]),
    ("abbreviated group names an unknown atom", ["/abbreviatedGroups/0"]),
    ("abbreviated ring missing one atom is attached by three bonds", ["/abbreviatedGroups/0"]),
    ("canonical arrows use an abbreviated atom", ["/steps/0/canonicalArrows"]),
    ("misconception names an abbreviated atom",
     ["/stateIdToState/enolate-and-aldehyde/misconceptions/2"]),
])
def test_finding_points_at_the_broken_place(case_name: str,
                                            expected_instance_paths: List[str]) -> None:
    lint_findings = lint_reaction(edited_reaction(case_name))
    assert [finding.instance_path for finding in lint_findings] == expected_instance_paths


def test_schema_violation_carries_the_schema_path() -> None:
    lint_findings = lint_reaction(edited_reaction("schema violation stops the lint"))
    assert [(finding.lint_rule_id, finding.instance_path) for finding in lint_findings] == [
        ("schema-violation", "")]


def test_message_says_which_rule_the_canonical_arrows_break() -> None:
    """The octet message comes from applying the arrows (state_graphs.arrow_application)."""
    lint_findings = lint_reaction(edited_reaction("canonical arrows break the octet"))
    assert "C2" in lint_findings[0].message and "10" in lint_findings[0].message


def test_message_says_a_resonance_form_is_not_the_drawing() -> None:
    lint_findings = lint_reaction(
        edited_reaction("canonical arrows give a resonance form, not the drawing"))
    assert "resonance form" in lint_findings[0].message


def test_symmetry_cap_warns_on_each_state_where_arrows_are_drawn() -> None:
    """The Wittig reactants have 96 skeleton symmetries (hand count: 3! orders of the phenyls x
    2^3 ring flips x 2 cyclohexanone flips; build item 4); betaine and oxaphosphetane keep the
    same skeleton symmetries. A cap of 50 is passed by all three; the product state has no arrow
    step leaving it, so it is not checked."""
    lint_findings = lint_reaction(load_example_reaction("wittig-methylenation-cyclohexanone.json"),
                                  maximum_symmetries=50)
    assert {finding.lint_rule_id for finding in lint_findings} == {"too-many-skeleton-symmetries"}
    assert sorted(finding.instance_path for finding in lint_findings) == [
        "/stateIdToState/betaine/mappedSmiles", "/stateIdToState/oxaphosphetane/mappedSmiles",
        "/stateIdToState/reactants/mappedSmiles"]


def test_lint_finding_to_json_uses_camel_case_keys() -> None:
    lint_finding = LintFinding("state-unreachable", LintLevel.ERROR, "/stateIdToState/betaine",
                               "no route reaches it")
    assert lint_finding_to_json(lint_finding) == {
        "lintRuleId": "state-unreachable", "lintLevel": "error",
        "instancePath": "/stateIdToState/betaine", "message": "no route reaches it"}
