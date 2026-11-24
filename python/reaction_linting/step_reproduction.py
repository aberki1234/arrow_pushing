"""Lint rules that apply each step to its from-state (docs/schema-design.md section 3.5).

Rules, all errors
    step-does-not-reproduce-to-state        (rule 6) The canonical arrows, applied to the
        from-state, must give the to-state exactly as drawn: the learner moves on to the drawing,
        so a resonance form of it is not enough. Each partial arrow set must be accepted for the
        step (§4: identical or a resonance form, up to skeleton symmetry). A change step's added
        and removed molecules must give the to-state exactly.
    leaving-steps-reach-equivalent-states   (rule 5) Two arrow steps leaving one state reach
        states that are resonance-equivalent up to a skeleton symmetry of that state: an attempt
        could not tell them apart.

Arrow sets are checked with the validator itself (attempt_assessment.assess_attempt), on a copy
of the prepared reaction where the step being checked is the only one leaving its state, so the
linter accepts exactly what the browser accepts, for that step.
"""
from dataclasses import replace
from itertools import combinations
from typing import Any, List, Mapping, Optional, Sequence

from arrow_notation.curved_arrow_notation import CurvedArrow
from attempt_assessment.attempt_assessment import (
    CorrectAssessment,
    GenericRuleAssessment,
    assess_attempt,
)
from attempt_assessment.prepared_reaction import PreparedReaction, PreparedStep, symmetries_of
from attempt_assessment.resonance_equivalence import StateComparison, compare_states
from attempt_assessment.skeleton_symmetry import relabel_state_graph
from state_graphs.arrow_application import (
    ArrowApplicationError,
    SpeciesChangeError,
    apply_curved_arrows,
    apply_species_change,
)
from state_graphs.mapped_smiles_reading import MappedSmilesError, state_graph_from_mapped_smiles
from state_graphs.state_graph import state_graph_to_json

from reaction_linting.lint_findings import LintFinding, lint_error


def _prepared_step(prepared: PreparedReaction, step: Mapping[str, Any]) -> PreparedStep:
    return next(prepared_step for prepared_step
                in prepared.state_id_to_leaving_steps[step["fromStateId"]]
                if prepared_step.step_key == step["stepKey"])


def _with_only_step(prepared: PreparedReaction, prepared_step: PreparedStep,
                    from_state_id: str) -> PreparedReaction:
    """A shallow copy in which `prepared_step` is the only step leaving `from_state_id` (the
    symmetry cache is shared)."""
    return replace(prepared, state_id_to_leaving_steps={
        **prepared.state_id_to_leaving_steps, from_state_id: [prepared_step]})


def assess_for_step_alone(prepared: PreparedReaction, prepared_step: PreparedStep,
                          from_state_id: str, curved_arrows: Sequence[CurvedArrow]
                          ) -> Optional[CorrectAssessment]:
    """The validator's correct assessment of `curved_arrows` at `from_state_id` when
    `prepared_step` is the only step leaving it; None if they are not accepted for that step."""
    assessment = assess_attempt(_with_only_step(prepared, prepared_step, from_state_id),
                                from_state_id, curved_arrows)
    return assessment if isinstance(assessment, CorrectAssessment) else None


def _why_not_accepted(prepared: PreparedReaction, prepared_step: PreparedStep,
                      from_state_id: str, curved_arrows: Sequence[CurvedArrow]) -> str:
    """For arrows that are not accepted: the arrow-application rule they break, the generic rule
    the validator gives, or that their result is not the to-state."""
    try:
        apply_curved_arrows(prepared.state_id_to_graph[from_state_id], curved_arrows)
    except ArrowApplicationError as error:
        return f"{error.generic_rule_id}: {error}"
    # Without misconceptions, so the assessment names a generic rule if one applies.
    without_misconceptions = replace(
        _with_only_step(prepared, prepared_step, from_state_id),
        state_id_to_misconceptions={**prepared.state_id_to_misconceptions, from_state_id: []})
    assessment = assess_attempt(without_misconceptions, from_state_id, curved_arrows)
    if isinstance(assessment, GenericRuleAssessment):
        return f"{assessment.generic_rule_id}: {assessment.message}"
    return f'the result is not state "{prepared_step.to_state_id}"'


def _arrow_step_findings(prepared: PreparedReaction, step: Mapping[str, Any],
                         position: int) -> List[LintFinding]:
    prepared_step = _prepared_step(prepared, step)
    from_state_id = step["fromStateId"]
    canonical_arrows, *partial_arrow_sets = prepared_step.known_arrow_sets
    findings = []
    canonical = assess_for_step_alone(prepared, prepared_step, from_state_id, canonical_arrows)
    if canonical is None:
        reason = _why_not_accepted(prepared, prepared_step, from_state_id, canonical_arrows)
        findings.append(lint_error(
            "step-does-not-reproduce-to-state", ["steps", position, "canonicalArrows"],
            f'step "{step["stepKey"]}": canonical arrows do not give the to-state ({reason})'))
    elif canonical.is_different_drawing:
        findings.append(lint_error(
            "step-does-not-reproduce-to-state", ["steps", position, "canonicalArrows"],
            f'step "{step["stepKey"]}": canonical arrows give a resonance form of state '
            f'"{step["toStateId"]}", not its drawing; draw the state as the arrows give it'))
    for set_position, arrow_set in enumerate(partial_arrow_sets):
        if assess_for_step_alone(prepared, prepared_step, from_state_id, arrow_set) is None:
            reason = _why_not_accepted(prepared, prepared_step, from_state_id, arrow_set)
            findings.append(lint_error(
                "step-does-not-reproduce-to-state",
                ["steps", position, "partialArrowSets", set_position],
                f'step "{step["stepKey"]}": partial arrow set {set_position} is not accepted '
                f"for the step ({reason})"))
    return findings


def _change_step_problem(prepared: PreparedReaction, step: Mapping[str, Any]) -> Optional[str]:
    """Why a change step does not give its to-state exactly, or None if it does."""
    try:
        added_species = (state_graph_from_mapped_smiles(step["addedSpecies"])
                         if "addedSpecies" in step else None)
        result = apply_species_change(prepared.state_id_to_graph[step["fromStateId"]],
                                      added_species, step.get("removedFragmentMapNumbers", []))
    except (MappedSmilesError, SpeciesChangeError) as error:
        return str(error)
    if state_graph_to_json(result) != state_graph_to_json(
            prepared.state_id_to_graph[step["toStateId"]]):
        return f'the result is not state "{step["toStateId"]}"'
    return None


def step_reproduction_findings(reaction_document: Mapping[str, Any],
                               prepared: PreparedReaction) -> List[LintFinding]:
    """step-does-not-reproduce-to-state, at "/steps/<position>/canonicalArrows",
    ".../partialArrowSets/<position>" or "/steps/<position>" for a change step."""
    findings: List[LintFinding] = []
    for position, step in enumerate(reaction_document["steps"]):
        if step["stepKind"] != "change":
            findings += _arrow_step_findings(prepared, step, position)
            continue
        problem = _change_step_problem(prepared, step)
        if problem is not None:
            findings.append(lint_error("step-does-not-reproduce-to-state", ["steps", position],
                                       f'change step "{step["stepKey"]}": {problem}'))
    return findings


def _reach_equivalent_states(prepared: PreparedReaction, from_state_id: str,
                             first_to_state_id: str, second_to_state_id: str) -> bool:
    """The two to-states are resonance-equivalent up to a skeleton symmetry of the from-state.
    To-states with other atoms than the from-state (a step that does not reproduce) are not."""
    atoms = set(prepared.state_id_to_graph[from_state_id].map_number_to_atom)
    first_target = prepared.state_id_to_graph[first_to_state_id]
    second_target = prepared.state_id_to_graph[second_to_state_id]
    if set(first_target.map_number_to_atom) != atoms or set(
            second_target.map_number_to_atom) != atoms:
        return False
    return any(compare_states(relabel_state_graph(first_target, symmetry), second_target)
               != StateComparison.DIFFERENT for symmetry in symmetries_of(prepared, from_state_id))


def equivalent_leaving_step_findings(reaction_document: Mapping[str, Any],
                                     prepared: PreparedReaction) -> List[LintFinding]:
    """leaving-steps-reach-equivalent-states, at the later of the two steps."""
    arrow_steps = [(position, step) for position, step in enumerate(reaction_document["steps"])
                   if step["stepKind"] != "change"]
    findings = []
    for (_, first_step), (second_position, second_step) in combinations(arrow_steps, 2):
        if first_step["fromStateId"] == second_step["fromStateId"] and _reach_equivalent_states(
                prepared, first_step["fromStateId"], first_step["toStateId"],
                second_step["toStateId"]):
            findings.append(lint_error(
                "leaving-steps-reach-equivalent-states", ["steps", second_position],
                f'steps "{first_step["stepKey"]}" and "{second_step["stepKey"]}" reach '
                "resonance-equivalent states, so an attempt cannot tell them apart; keep one"))
    return findings
