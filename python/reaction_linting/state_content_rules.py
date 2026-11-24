"""Lint rules on what each state shows the learner, and on its size for symmetry.

Rules
    learner-prompt-missing        error    a state with an arrow step leaving it has no
                                           learnerPrompt
    hint-tiers-missing            error    such a state has no hintTiers (every step needs at
                                           least one hint before submission, docs/SPEC.md)
    fewer-than-three-hint-tiers   warning  such a state has fewer than 3 hint tiers (the
                                           conceptual / narrowing / reveal ladder)
    too-many-skeleton-symmetries  warning  a state with an arrow step leaving it has more than
                                           the symmetry cap, so equivalent atoms there are not
                                           accepted (docs/schema-design.md section 4)
"""
from typing import Any, List, Mapping

from attempt_assessment.prepared_reaction import PreparedReaction
from attempt_assessment.skeleton_symmetry import (
    MAXIMUM_SKELETON_SYMMETRIES,
    skeleton_symmetries_within_cap,
)

from reaction_linting.lint_findings import LintFinding, lint_error, lint_warning

FULL_HINT_LADDER_LENGTH = 3  # conceptual, narrowing, reveal


def _state_ids_with_arrow_steps_leaving(reaction_document: Mapping[str, Any]) -> List[str]:
    """In stateIdToState order: the states where the learner draws arrows."""
    from_state_ids = {step["fromStateId"] for step in reaction_document["steps"]
                      if step["stepKind"] != "change"}
    return [state_id for state_id in reaction_document["stateIdToState"]
            if state_id in from_state_ids]


def learner_text_findings(reaction_document: Mapping[str, Any]) -> List[LintFinding]:
    """The three learner-text rules: a missing key at "/stateIdToState/<state id>", too few hint
    tiers at ".../hintTiers"."""
    findings = []
    for state_id in _state_ids_with_arrow_steps_leaving(reaction_document):
        state = reaction_document["stateIdToState"][state_id]
        if "learnerPrompt" not in state:
            findings.append(lint_error("learner-prompt-missing", ["stateIdToState", state_id],
                                       f'state "{state_id}": arrows are drawn here, so it needs '
                                       "a learnerPrompt"))
        hint_count = len(state.get("hintTiers", []))
        if hint_count == 0:
            findings.append(lint_error("hint-tiers-missing", ["stateIdToState", state_id],
                                       f'state "{state_id}": arrows are drawn here, so it needs '
                                       "at least one hint tier"))
        elif hint_count < FULL_HINT_LADDER_LENGTH:
            findings.append(lint_warning(
                "fewer-than-three-hint-tiers", ["stateIdToState", state_id, "hintTiers"],
                f'state "{state_id}": {hint_count} hint tier(s); the full ladder is conceptual, '
                "narrowing, reveal"))
    return findings


def symmetry_cap_findings(reaction_document: Mapping[str, Any], prepared: PreparedReaction,
                          maximum_symmetries: int = MAXIMUM_SKELETON_SYMMETRIES
                          ) -> List[LintFinding]:
    """too-many-skeleton-symmetries, at "/stateIdToState/<state id>/mappedSmiles"."""
    return [lint_warning("too-many-skeleton-symmetries",
                         ["stateIdToState", state_id, "mappedSmiles"],
                         f'state "{state_id}": more than {maximum_symmetries} skeleton '
                         "symmetries, so equivalent atoms are not accepted here; draw fewer "
                         "explicit hydrogens")
            for state_id in _state_ids_with_arrow_steps_leaving(reaction_document)
            if skeleton_symmetries_within_cap(prepared.state_id_to_graph[state_id],
                                              maximum_symmetries) is None]
