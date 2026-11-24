"""A reaction file read once for assessing attempts.

Purpose
    Assessing an attempt needs each state's graph, the arrow steps leaving it (with their known
    arrow sets parsed), its misconceptions (patterns parsed) and partial-progress messages, and
    its skeleton symmetries. prepare_reaction() reads a (schema-valid) reaction file into that
    form once; symmetries_of() works out a state's symmetries the first time they are needed.
    The TypeScript twin is src/attemptAssessment/preparedReaction.ts.
"""
from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from arrow_notation.curved_arrow_notation import CurvedArrow, parse_curved_arrow
from state_graphs.mapped_smiles_reading import state_graph_from_mapped_smiles
from state_graphs.state_graph import StateGraph

from attempt_assessment.arrow_patterns import ArrowPattern, parse_arrow_pattern
from attempt_assessment.skeleton_symmetry import skeleton_symmetries


@dataclass(frozen=True)
class PreparedStep:
    """An arrow step leaving a state, with its known arrow sets parsed (canonical arrows first)."""
    step_key: str
    step_kind: str
    route_preference: str
    to_state_id: str
    known_arrow_sets: Tuple[Tuple[CurvedArrow, ...], ...]


@dataclass(frozen=True)
class PreparedMisconception:
    misconception_id: str
    misconception_tag: Optional[str]
    severity: str
    arrow_pattern: ArrowPattern
    feedback_message: str


@dataclass(frozen=True)
class PartialProgressMessage:
    learner_arrows: Tuple[CurvedArrow, ...]
    feedback_message: str


@dataclass
class PreparedReaction:
    """A reaction file read once for assessing: state graphs, arrow steps leaving each state,
    parsed misconceptions and partial-progress messages. Symmetries are filled in as needed."""
    state_id_to_graph: Dict[str, StateGraph]
    state_id_to_leaving_steps: Dict[str, List[PreparedStep]]
    state_id_to_misconceptions: Dict[str, List[PreparedMisconception]]
    state_id_to_partial_progress_messages: Dict[str, List[PartialProgressMessage]]
    state_id_to_symmetries: Dict[str, List[Dict[int, int]]]


def _parsed_arrows(notations: Sequence[str]) -> Tuple[CurvedArrow, ...]:
    return tuple(parse_curved_arrow(notation) for notation in notations)


def _prepared_steps(reaction_document: Mapping[str, Any]) -> Dict[str, List[PreparedStep]]:
    """The arrow steps leaving each state (change steps are events, not attempts)."""
    state_id_to_leaving_steps: Dict[str, List[PreparedStep]] = {}
    for step in reaction_document["steps"]:
        if step["stepKind"] == "change":
            continue
        known_arrow_sets = (_parsed_arrows(step["canonicalArrows"]),) + tuple(
            _parsed_arrows(arrow_set) for arrow_set in step.get("partialArrowSets", []))
        state_id_to_leaving_steps.setdefault(step["fromStateId"], []).append(PreparedStep(
            step["stepKey"], step["stepKind"], step["routePreference"], step["toStateId"],
            known_arrow_sets))
    return state_id_to_leaving_steps


def prepare_reaction(reaction_document: Mapping[str, Any]) -> PreparedReaction:
    """Read a (schema-valid) reaction file for assessing attempts."""
    roles = reaction_document["atomRoleToMapNumbers"]
    states = reaction_document["stateIdToState"]
    return PreparedReaction(
        state_id_to_graph={state_id: state_graph_from_mapped_smiles(state["mappedSmiles"])
                           for state_id, state in states.items()},
        state_id_to_leaving_steps=_prepared_steps(reaction_document),
        state_id_to_misconceptions={
            state_id: [PreparedMisconception(
                entry["misconceptionId"], entry.get("misconceptionTag"), entry["severity"],
                parse_arrow_pattern(entry["arrowPattern"], roles), entry["feedbackMessage"])
                for entry in state.get("misconceptions", [])]
            for state_id, state in states.items()},
        state_id_to_partial_progress_messages={
            state_id: [PartialProgressMessage(_parsed_arrows(entry["learnerArrows"]),
                                              entry["feedbackMessage"])
                       for entry in state.get("partialProgressMessages", [])]
            for state_id, state in states.items()},
        state_id_to_symmetries={})


def symmetries_of(prepared: PreparedReaction, state_id: str) -> List[Dict[int, int]]:
    if state_id not in prepared.state_id_to_symmetries:
        prepared.state_id_to_symmetries[state_id] = skeleton_symmetries(
            prepared.state_id_to_graph[state_id])
    return prepared.state_id_to_symmetries[state_id]
