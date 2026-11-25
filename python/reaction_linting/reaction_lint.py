"""Lint one reaction file: every rule, in an order where each check can trust the ones before.

Steps (a later group runs only when the earlier groups found no error that would break it)
    1. schema-violation (error): reaction_files.schema_violations, one finding per violation.
       Stop here if any: later checks assume the file's shape.
    2. state-atoms-inconsistent (error): reaction_files.state_atom_consistency. Then
       mapped-smiles-not-supported (error): a state outside the strict SMILES subset
       (state_graphs.mapped_smiles_reading). Stop here if any: later checks read every state.
    3. Graph rules without chemistry (mechanism_graph_rules), state ids first; stop if a step
       names an unknown state.
    4. Learner text (state_content_rules), misconception text (misconception_rules) and
       abbreviated groups (abbreviated_group_rules).
    5. Chemistry, on the reaction prepared for assessment without any misconception whose
       pattern does not parse: steps reproduce their to-states and leaving steps reach different
       states (step_reproduction), misconception matching (misconception_rules), symmetry cap.
"""
from typing import Any, List, Mapping

from attempt_assessment.prepared_reaction import prepare_reaction
from attempt_assessment.skeleton_symmetry import MAXIMUM_SKELETON_SYMMETRIES
from reaction_files.schema_violations import schema_violations
from reaction_files.state_atom_consistency import state_atom_problems
from state_graphs.mapped_smiles_reading import MappedSmilesError, state_graph_from_mapped_smiles

from reaction_linting.abbreviated_group_rules import (
    abbreviated_group_arrow_findings,
    abbreviated_group_structure_findings,
)
from reaction_linting.lint_findings import LintFinding, LintLevel, lint_error
from reaction_linting.mechanism_graph_rules import (
    mechanism_graph_findings,
    unknown_state_id_findings,
)
from reaction_linting.misconception_rules import (
    misconception_matching_findings,
    misconception_text_findings,
    without_invalid_patterns,
)
from reaction_linting.state_content_rules import learner_text_findings, symmetry_cap_findings
from reaction_linting.step_reproduction import (
    equivalent_leaving_step_findings,
    step_reproduction_findings,
)


def _schema_findings(reaction_document: Mapping[str, Any]) -> List[LintFinding]:
    return [LintFinding("schema-violation", LintLevel.ERROR, violation.instance_path,
                        violation.message)
            for violation in schema_violations(reaction_document)]


def _state_reading_findings(reaction_document: Mapping[str, Any]) -> List[LintFinding]:
    """Step 2. State atom problems come as text lines "state <state id>: ..."; they point at
    the states as a whole."""
    findings = [lint_error("state-atoms-inconsistent", ["stateIdToState"], problem)
                for problem in state_atom_problems(reaction_document)]
    if findings:
        return findings
    for state_id, state in reaction_document["stateIdToState"].items():
        try:
            state_graph_from_mapped_smiles(state["mappedSmiles"])
        except MappedSmilesError as error:
            findings.append(lint_error("mapped-smiles-not-supported",
                                       ["stateIdToState", state_id, "mappedSmiles"],
                                       f"{error.error_code}: {error}"))
    return findings


def lint_reaction(reaction_document: Mapping[str, Any],
                  maximum_symmetries: int = MAXIMUM_SKELETON_SYMMETRIES) -> List[LintFinding]:
    """Every lint finding for the document, in the order of the steps above; empty if clean."""
    for blocking_check in (_schema_findings, _state_reading_findings, unknown_state_id_findings):
        blocking_findings = blocking_check(reaction_document)
        if blocking_findings:
            return blocking_findings
    findings = (mechanism_graph_findings(reaction_document)
                + learner_text_findings(reaction_document)
                + misconception_text_findings(reaction_document)
                + abbreviated_group_structure_findings(reaction_document)
                + abbreviated_group_arrow_findings(reaction_document))
    prepared = prepare_reaction(without_invalid_patterns(reaction_document))
    return (findings
            + step_reproduction_findings(reaction_document, prepared)
            + equivalent_leaving_step_findings(reaction_document, prepared)
            + misconception_matching_findings(reaction_document, prepared)
            + symmetry_cap_findings(reaction_document, prepared, maximum_symmetries))
