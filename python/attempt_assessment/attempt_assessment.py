"""Assess one learner attempt: the arrows drawn at a state, against the steps leaving it.

Purpose
    This is the validator's decision (docs/schema-design.md sections 4 and 5). The TypeScript
    twin (src/attemptAssessment/attemptAssessment.ts) runs in the browser; both pass the shared
    cases in fixtures/assessment/attempt_cases.json.

Terms (docs/schema-design.md section 0)
    leaving step        a step whose fromStateId is the current state
    known arrow sets    a leaving step's canonical arrows and its partial arrow sets
    attempt assessment  the answer: correct, misconception, genericRule, partialProgress or wrong

Order (first that applies wins; decided 2026-11-24)
    1. correct          the arrows' type fits the step kind, they apply, none are redundant, the
                        result is identical or a resonance form of the step's to-state, up to a
                        skeleton symmetry of the state
    2. meaningless      arrow-application rules atom-not-in-state, destination-not-adjacent-to-
                        source, no-electrons-at-source
    3. misconception    the state's authored misconceptions, in list order, up to symmetry
    4. partialProgress  the arrows are an authored partial-progress set, or part of a known arrow
                        set, or give a minor resonance form of a to-state. It reports both the
                        progress (arrows still missing, authored message) and any rule the arrows
                        break (an arrow-application rule, or minor-resonance-form), so the screen
                        can say "right so far ... but ..."
    5. genericRule      wrong-arrow-type (no leaving step's kind fits), redundant-arrow (some
                        arrows together move no electrons, e.g. an arrow and its reverse, so
                        removing them changes nothing), reversed-flow (an arrow whose source and
                        destination atoms are those of a known arrow, swapped), then any other
                        arrow-application rule
    6. wrong            none of the above
"""
from collections import Counter
from dataclasses import dataclass
from itertools import combinations
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

from arrow_notation.curved_arrow_notation import CurvedArrow, format_curved_arrow
from state_graphs.arrow_application import ArrowApplicationError, apply_curved_arrows
from state_graphs.state_graph import StateGraph

from attempt_assessment.arrow_patterns import arrow_pattern_matches
from attempt_assessment.prepared_reaction import (
    PreparedReaction,
    PreparedStep,
    prepare_reaction,
    symmetries_of,
)
from attempt_assessment.resonance_equivalence import StateComparison, compare_states
from attempt_assessment.skeleton_symmetry import relabel_curved_arrow, relabel_state_graph

# prepare_reaction is re-exported: callers read a reaction and assess attempts from one module.
__all__ = ["prepare_reaction", "assess_attempt", "assessment_to_json"]

MEANINGLESS_ARROW_RULE_IDS = frozenset(
    {"atom-not-in-state", "destination-not-adjacent-to-source", "no-electrons-at-source"})
STEP_KIND_TO_ELECTRONS_MOVED = {"polar": 2, "radical": 1}
# Comparisons from best to worst: a better one wins when several symmetries give a match.
COMPARISONS_BEST_FIRST = (StateComparison.IDENTICAL, StateComparison.RESONANCE_FORM,
                          StateComparison.MINOR_RESONANCE_FORM, StateComparison.DIFFERENT)
MINOR_RESONANCE_FORM_MESSAGE = (
    "This is a charge-separated resonance form of the expected structure: it has more charged "
    "atoms. Move the electrons that would cancel those charges.")


@dataclass(frozen=True)
class BrokenRule:
    generic_rule_id: str
    message: str


@dataclass(frozen=True)
class CorrectAssessment:
    """`is_different_drawing`: a resonance form of the to-state, not its drawing."""
    step_key: str
    route_preference: str
    is_different_drawing: bool


@dataclass(frozen=True)
class MisconceptionAssessment:
    misconception_id: str
    misconception_tag: Optional[str]
    severity: str
    feedback_message: str


@dataclass(frozen=True)
class GenericRuleAssessment:
    generic_rule_id: str
    message: str


@dataclass(frozen=True)
class PartialProgressAssessment:
    """`arrows_still_missing` is None when the arrows are not part of a known set (an authored
    message or a minor resonance form only)."""
    arrows_still_missing: Optional[int]
    authored_message: Optional[str]
    broken_rule: Optional[BrokenRule]


@dataclass(frozen=True)
class WrongAssessment:
    pass


AttemptAssessment = Union[CorrectAssessment, MisconceptionAssessment, GenericRuleAssessment,
                          PartialProgressAssessment, WrongAssessment]


@dataclass(frozen=True)
class _ArrowApplication:
    """The learner's arrows applied to the state: the result, or the rule they break."""
    result: Optional[StateGraph]
    error: Optional[ArrowApplicationError]


def _apply(state: StateGraph, curved_arrows: Sequence[CurvedArrow]) -> _ArrowApplication:
    try:
        return _ArrowApplication(apply_curved_arrows(state, curved_arrows), None)
    except ArrowApplicationError as error:
        return _ArrowApplication(None, error)


def _net_electron_changes(curved_arrows: Sequence[CurvedArrow]) -> Counter[Tuple[int, ...]]:
    """Electrons gained (negative: lost) at each place: an atom's nonbonding electrons, keyed
    (map number,), or a bond, keyed (smaller map number, larger map number)."""
    place_to_electron_change: Counter[Tuple[int, ...]] = Counter()
    for curved_arrow in curved_arrows:
        for locus, sign in ((curved_arrow.source, -1), (curved_arrow.destination, +1)):
            place = tuple(atom.map_number for atom in locus.atoms)
            place_to_electron_change[place] += sign * curved_arrow.electrons_moved
    return place_to_electron_change


def _cancelling_arrows(learner_arrows: Sequence[CurvedArrow]) -> Optional[Tuple[CurvedArrow, ...]]:
    """The smallest group of arrows that together move no electrons (e.g. an arrow and its
    reverse), if there is one: removing that group leaves the result unchanged."""
    for group_size in range(1, len(learner_arrows) + 1):
        for group in combinations(learner_arrows, group_size):
            if not any(_net_electron_changes(group).values()):
                return group
    return None


def _best_comparison(result: StateGraph, target: StateGraph,
                     symmetries: Sequence[Dict[int, int]]) -> StateComparison:
    """The best comparison of the result, relabelled by any symmetry, with the target."""
    comparisons = {compare_states(relabel_state_graph(result, symmetry), target)
                   for symmetry in symmetries}
    return next(comparison for comparison in COMPARISONS_BEST_FIRST if comparison in comparisons)


def _arrow_types_fit(step: PreparedStep, learner_arrows: Sequence[CurvedArrow]) -> bool:
    electrons_moved = STEP_KIND_TO_ELECTRONS_MOVED[step.step_kind]
    return all(curved_arrow.electrons_moved == electrons_moved for curved_arrow in learner_arrows)


@dataclass(frozen=True)
class _Attempt:
    """One attempt being assessed, with what is worked out once and used by several checks."""
    prepared: PreparedReaction
    state_id: str
    learner_arrows: Tuple[CurvedArrow, ...]
    application: _ArrowApplication
    cancelling_arrows: Optional[Tuple[CurvedArrow, ...]]
    symmetries: Tuple[Dict[int, int], ...]


def _step_comparisons(attempt: _Attempt) -> List[Tuple[PreparedStep, StateComparison]]:
    """Each leaving step whose arrow type fits, with how the result compares to its to-state."""
    result = attempt.application.result
    if result is None:
        return []
    return [(step, _best_comparison(result, attempt.prepared.state_id_to_graph[step.to_state_id],
                                    attempt.symmetries))
            for step in attempt.prepared.state_id_to_leaving_steps[attempt.state_id]
            if _arrow_types_fit(step, attempt.learner_arrows)]


def _correct_assessment(attempt: _Attempt) -> Optional[CorrectAssessment]:
    """Check 1. The same drawing beats a resonance form."""
    if attempt.cancelling_arrows is not None:
        return None
    step_comparisons = _step_comparisons(attempt)
    for wanted, is_different_drawing in ((StateComparison.IDENTICAL, False),
                                         (StateComparison.RESONANCE_FORM, True)):
        for step, comparison in step_comparisons:
            if comparison == wanted:
                return CorrectAssessment(step.step_key, step.route_preference,
                                         is_different_drawing)
    return None


def _relabelled_arrows(attempt: _Attempt, symmetry: Dict[int, int]) -> List[CurvedArrow]:
    return [relabel_curved_arrow(curved_arrow, symmetry) for curved_arrow in attempt.learner_arrows]


def _misconception_assessment(attempt: _Attempt) -> Optional[MisconceptionAssessment]:
    """Check 3: the first misconception whose pattern matches, up to symmetry."""
    for misconception in attempt.prepared.state_id_to_misconceptions[attempt.state_id]:
        if any(arrow_pattern_matches(misconception.arrow_pattern,
                                     _relabelled_arrows(attempt, symmetry))
               for symmetry in attempt.symmetries):
            return MisconceptionAssessment(
                misconception.misconception_id, misconception.misconception_tag,
                misconception.severity, misconception.feedback_message)
    return None


def _arrow_multiset(curved_arrows: Sequence[CurvedArrow]) -> Counter[str]:
    return Counter(format_curved_arrow(curved_arrow) for curved_arrow in curved_arrows)


def _arrows_still_missing(attempt: _Attempt) -> Optional[int]:
    """The fewest arrows to add to reach a known arrow set, if the arrows are part of one."""
    missing_counts = []
    for step in attempt.prepared.state_id_to_leaving_steps[attempt.state_id]:
        for known_arrow_set in step.known_arrow_sets:
            known = _arrow_multiset(known_arrow_set)
            for symmetry in attempt.symmetries:
                drawn = _arrow_multiset(_relabelled_arrows(attempt, symmetry))
                if drawn < known:  # a strictly smaller part of the known set
                    missing_counts.append(len(known_arrow_set) - len(attempt.learner_arrows))
    return min(missing_counts) if missing_counts else None


def _authored_partial_message(attempt: _Attempt) -> Optional[str]:
    messages = attempt.prepared.state_id_to_partial_progress_messages[attempt.state_id]
    for message in messages:
        wanted = _arrow_multiset(message.learner_arrows)
        if any(_arrow_multiset(_relabelled_arrows(attempt, symmetry)) == wanted
               for symmetry in attempt.symmetries):
            return message.feedback_message
    return None


def _partial_progress_assessment(attempt: _Attempt) -> Optional[PartialProgressAssessment]:
    """Check 4: progress, together with any rule the arrows break."""
    arrows_still_missing = _arrows_still_missing(attempt)
    authored_message = _authored_partial_message(attempt)
    is_minor_form = any(comparison == StateComparison.MINOR_RESONANCE_FORM
                        for _, comparison in _step_comparisons(attempt))
    if arrows_still_missing is None and authored_message is None and not is_minor_form:
        return None
    error = attempt.application.error
    broken_rule = (BrokenRule(error.generic_rule_id, str(error)) if error is not None
                   else BrokenRule("minor-resonance-form", MINOR_RESONANCE_FORM_MESSAGE)
                   if is_minor_form else None)
    return PartialProgressAssessment(arrows_still_missing, authored_message, broken_rule)


def _reversed_arrow(attempt: _Attempt) -> Optional[CurvedArrow]:
    """A learner arrow whose source and destination atoms are a known arrow's, swapped."""
    def atom_sets(curved_arrow: CurvedArrow) -> Tuple[frozenset[int], frozenset[int]]:
        return (frozenset(atom.map_number for atom in curved_arrow.source.atoms),
                frozenset(atom.map_number for atom in curved_arrow.destination.atoms))
    known_reversed = {atom_sets(known)[::-1]
                      for step in attempt.prepared.state_id_to_leaving_steps[attempt.state_id]
                      for known_arrow_set in step.known_arrow_sets for known in known_arrow_set}
    for symmetry in attempt.symmetries:
        relabelled_arrows = _relabelled_arrows(attempt, symmetry)
        for original, relabelled in zip(attempt.learner_arrows, relabelled_arrows, strict=True):
            if atom_sets(relabelled) in known_reversed:
                return original
    return None


def _generic_rule_assessment(attempt: _Attempt) -> Optional[GenericRuleAssessment]:
    """Check 5, in order: wrong-arrow-type, redundant-arrow, reversed-flow, other rules."""
    leaving_steps = attempt.prepared.state_id_to_leaving_steps[attempt.state_id]
    if not any(_arrow_types_fit(step, attempt.learner_arrows) for step in leaving_steps):
        wanted = " or ".join(sorted({step.step_kind for step in leaving_steps}))
        return GenericRuleAssessment(
            "wrong-arrow-type", f"This step is {wanted}: use "
            + ("fish-hooks (one electron each)" if wanted == "radical" else "pair arrows"))
    if attempt.cancelling_arrows is not None:
        cancelling = ", ".join(f'"{format_curved_arrow(curved_arrow)}"'
                               for curved_arrow in attempt.cancelling_arrows)
        return GenericRuleAssessment(
            "redundant-arrow", f"{cancelling}: together these move no electrons; remove them")
    reversed_arrow = _reversed_arrow(attempt)
    if reversed_arrow is not None:
        return GenericRuleAssessment("reversed-flow", (
            f'"{format_curved_arrow(reversed_arrow)}": the electrons flow the other way'))
    error = attempt.application.error
    return GenericRuleAssessment(error.generic_rule_id, str(error)) if error else None


def assess_attempt(prepared: PreparedReaction, state_id: str,
                   learner_arrows: Sequence[CurvedArrow]) -> AttemptAssessment:
    """Assess the learner's arrows at `state_id`. Raises ValueError if no arrow step leaves it.
    No arrows at all is assessed as wrong."""
    if not prepared.state_id_to_leaving_steps.get(state_id):
        raise ValueError(f'no arrow step leaves state "{state_id}"')
    if not learner_arrows:
        return WrongAssessment()
    state = prepared.state_id_to_graph[state_id]
    application = _apply(state, learner_arrows)
    attempt = _Attempt(prepared, state_id, tuple(learner_arrows), application,
                       _cancelling_arrows(learner_arrows),
                       tuple(symmetries_of(prepared, state_id)))
    error = application.error
    meaningless = (GenericRuleAssessment(error.generic_rule_id, str(error))
                   if error is not None and error.generic_rule_id in MEANINGLESS_ARROW_RULE_IDS
                   else None)
    for assessment in (_correct_assessment(attempt), meaningless):
        if assessment is not None:
            return assessment
    later_checks = (_misconception_assessment, _partial_progress_assessment,
                    _generic_rule_assessment)
    for check in later_checks:
        later_assessment = check(attempt)
        if later_assessment is not None:
            return later_assessment
    return WrongAssessment()


def assessment_to_json(assessment: AttemptAssessment) -> Dict[str, Any]:
    """The JSON spelling shared with TypeScript: {"assessmentKind": ..., camelCase fields}."""
    if isinstance(assessment, CorrectAssessment):
        return {"assessmentKind": "correct", "stepKey": assessment.step_key,
                "routePreference": assessment.route_preference,
                "isDifferentDrawing": assessment.is_different_drawing}
    if isinstance(assessment, MisconceptionAssessment):
        return {"assessmentKind": "misconception", "misconceptionId": assessment.misconception_id,
                "misconceptionTag": assessment.misconception_tag, "severity": assessment.severity,
                "feedbackMessage": assessment.feedback_message}
    if isinstance(assessment, GenericRuleAssessment):
        return {"assessmentKind": "genericRule", "genericRuleId": assessment.generic_rule_id,
                "message": assessment.message}
    if isinstance(assessment, PartialProgressAssessment):
        broken_rule = assessment.broken_rule
        return {"assessmentKind": "partialProgress",
                "arrowsStillMissing": assessment.arrows_still_missing,
                "authoredMessage": assessment.authored_message,
                "brokenRuleId": broken_rule.generic_rule_id if broken_rule else None,
                "brokenRuleMessage": broken_rule.message if broken_rule else None}
    return {"assessmentKind": "wrong"}
