"""Lint rules on the misconceptions of each state (docs/schema-design.md sections 3.5 and 5.2).

Rules
    duplicate-misconception-id         error    two misconceptions in the reaction share an id
                                                 (progress records name them by id)
    misconception-pattern-invalid      error    the arrowPattern cannot be parsed, or names a
                                                 role missing from atomRoleToMapNumbers
    misconception-hides-correct-answer error    (rule 7) the pattern matches, up to skeleton
                                                 symmetry, an arrow set of a leaving step that
                                                 the validator accepts (canonical arrows or a
                                                 partial arrow set)
    misconception-never-fires          warning  an earlier entry on the same state covers this
                                                 one (arrow_pattern_coverage), so it always wins

Steps
    misconception_text_findings() needs only the document (the first two rules). The others need
    the reaction prepared for assessment from without_invalid_patterns(), which keeps only the
    misconceptions whose patterns parse.
"""
import copy
from typing import Any, Dict, List, Mapping, Set

from attempt_assessment.arrow_patterns import (
    ArrowPatternError,
    arrow_pattern_matches,
    parse_arrow_pattern,
)
from attempt_assessment.prepared_reaction import PreparedReaction, symmetries_of
from attempt_assessment.skeleton_symmetry import relabel_curved_arrow

from reaction_linting.arrow_pattern_coverage import arrow_pattern_covers
from reaction_linting.lint_findings import LintFinding, lint_error, lint_warning
from reaction_linting.step_reproduction import assess_for_step_alone


def _misconception_path(state_id: str, position: int) -> List[Any]:
    return ["stateIdToState", state_id, "misconceptions", position]


def _pattern_parses(pattern_text: str, atom_role_to_map_numbers: Dict[str, List[int]]) -> bool:
    try:
        parse_arrow_pattern(pattern_text, atom_role_to_map_numbers)
    except ArrowPatternError:
        return False
    return True


def _positions_of_parsable_patterns(reaction_document: Mapping[str, Any],
                                    state_id: str) -> List[int]:
    """The positions, in the state's misconception list, of the entries whose patterns parse:
    position k of the prepared reaction's list is the entry at the k-th of these."""
    roles = reaction_document.get("atomRoleToMapNumbers", {})
    misconceptions = reaction_document["stateIdToState"][state_id].get("misconceptions", [])
    return [position for position, misconception in enumerate(misconceptions)
            if _pattern_parses(misconception["arrowPattern"], roles)]


def without_invalid_patterns(reaction_document: Mapping[str, Any]) -> Dict[str, Any]:
    """A copy of the document without the misconceptions whose patterns do not parse, so that
    attempt_assessment.prepare_reaction() can read it."""
    document_copy: Dict[str, Any] = copy.deepcopy(dict(reaction_document))
    for state_id, state in document_copy["stateIdToState"].items():
        if "misconceptions" in state:
            state["misconceptions"] = [
                state["misconceptions"][position]
                for position in _positions_of_parsable_patterns(reaction_document, state_id)]
    return document_copy


def misconception_text_findings(reaction_document: Mapping[str, Any]) -> List[LintFinding]:
    """duplicate-misconception-id and misconception-pattern-invalid, at
    "/stateIdToState/<state id>/misconceptions/<position>"."""
    roles = reaction_document.get("atomRoleToMapNumbers", {})
    seen_ids: Set[str] = set()
    findings = []
    for state_id, state in reaction_document["stateIdToState"].items():
        for position, misconception in enumerate(state.get("misconceptions", [])):
            misconception_id = misconception["misconceptionId"]
            if misconception_id in seen_ids:
                findings.append(lint_error(
                    "duplicate-misconception-id", _misconception_path(state_id, position),
                    f'misconception id "{misconception_id}" is used by an earlier misconception'))
            seen_ids.add(misconception_id)
            try:
                parse_arrow_pattern(misconception["arrowPattern"], roles)
            except ArrowPatternError as error:
                findings.append(lint_error(
                    "misconception-pattern-invalid", _misconception_path(state_id, position),
                    f"{error.error_code}: {error}"))
    return findings


def _hidden_correct_answer_findings(prepared: PreparedReaction, state_id: str,
                                    positions: List[int]) -> List[LintFinding]:
    """Rule 7: a misconception matching, up to symmetry, an accepted known arrow set."""
    accepted_arrow_sets = [
        arrow_set for step in prepared.state_id_to_leaving_steps.get(state_id, [])
        for arrow_set in step.known_arrow_sets
        if assess_for_step_alone(prepared, step, state_id, arrow_set) is not None]
    findings = []
    misconceptions = prepared.state_id_to_misconceptions[state_id]
    for misconception, position in zip(misconceptions, positions, strict=True):
        if any(arrow_pattern_matches(misconception.arrow_pattern,
                                     [relabel_curved_arrow(curved_arrow, symmetry)
                                      for curved_arrow in arrow_set])
               for arrow_set in accepted_arrow_sets
               for symmetry in symmetries_of(prepared, state_id)):
            findings.append(lint_error(
                "misconception-hides-correct-answer",
                _misconception_path(state_id, position),
                f'misconception "{misconception.misconception_id}" matches arrows that are '
                "accepted for a step leaving this state, so it would hide a correct answer"))
    return findings


def _never_firing_findings(prepared: PreparedReaction, state_id: str,
                           positions: List[int]) -> List[LintFinding]:
    misconceptions = prepared.state_id_to_misconceptions[state_id]
    findings = []
    for later_index, later in enumerate(misconceptions):
        earlier_covering = next((earlier for earlier in misconceptions[:later_index]
                                 if arrow_pattern_covers(earlier.arrow_pattern,
                                                         later.arrow_pattern)), None)
        if earlier_covering is not None:
            findings.append(lint_warning(
                "misconception-never-fires",
                _misconception_path(state_id, positions[later_index]),
                f'misconception "{later.misconception_id}" never fires: the earlier '
                f'"{earlier_covering.misconception_id}" matches whatever it matches'))
    return findings


def misconception_matching_findings(reaction_document: Mapping[str, Any],
                                    prepared: PreparedReaction) -> List[LintFinding]:
    """misconception-hides-correct-answer and misconception-never-fires. `prepared` is made from
    without_invalid_patterns(reaction_document)."""
    findings: List[LintFinding] = []
    for state_id in reaction_document["stateIdToState"]:
        positions = _positions_of_parsable_patterns(reaction_document, state_id)
        findings += _hidden_correct_answer_findings(prepared, state_id, positions)
        findings += _never_firing_findings(prepared, state_id, positions)
    return findings
