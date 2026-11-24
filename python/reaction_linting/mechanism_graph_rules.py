"""Lint rules on the mechanism graph alone (states and steps, no chemistry).

Rules (docs/schema-design.md sections 3.4 and 3.5), all errors
    duplicate-step-key                     two steps share a stepKey (progress records use it)
    step-state-id-unknown                  a step's fromStateId or toStateId names no state
    state-unreachable                      no route from startStateId reaches the state (rule 1)
    mechanism-has-cycle                    some steps lead back to a state already passed (rule 2)
    not-exactly-one-product-state          the number of states with no steps leaving them is
                                           not 1, so some branch does not rejoin (rule 3)
    several-preferred-steps-leave-state    more than one preferred step leaves a state (rule 4)
    preferred-route-does-not-reach-product following preferred steps from the start state stops
                                           before the product state (rule 4)
    change-step-not-alone                  a change step shares its from-state with another step

Steps
    unknown_state_id_findings() runs first: the other rules assume every state id exists.
    mechanism_graph_findings() then checks the rest, in the order listed above.
"""
from typing import Any, Dict, List, Mapping, Optional, Set

from reaction_linting.lint_findings import LintFinding, lint_error

# A step's position in the "steps" list, used to point at it.
StepPosition = int


def unknown_state_id_findings(reaction_document: Mapping[str, Any]) -> List[LintFinding]:
    """step-state-id-unknown, at "/steps/<position>/fromStateId" or ".../toStateId"."""
    state_ids = reaction_document["stateIdToState"]
    return [lint_error("step-state-id-unknown", ["steps", position, key],
                       f'step "{step["stepKey"]}": no state "{step[key]}"')
            for position, step in enumerate(reaction_document["steps"])
            for key in ("fromStateId", "toStateId") if step[key] not in state_ids]


def _state_id_to_leaving_step_positions(reaction_document: Mapping[str, Any]
                                        ) -> Dict[str, List[StepPosition]]:
    """Every state id, with the positions of the steps leaving it (empty for a product state)."""
    state_id_to_positions: Dict[str, List[StepPosition]] = {
        state_id: [] for state_id in reaction_document["stateIdToState"]}
    for position, step in enumerate(reaction_document["steps"]):
        state_id_to_positions[step["fromStateId"]].append(position)
    return state_id_to_positions


def _duplicate_step_key_findings(reaction_document: Mapping[str, Any]) -> List[LintFinding]:
    """At the second and later uses of a step key."""
    seen_step_keys: Set[str] = set()
    findings = []
    for position, step in enumerate(reaction_document["steps"]):
        if step["stepKey"] in seen_step_keys:
            findings.append(lint_error("duplicate-step-key", ["steps", position, "stepKey"],
                                       f'step key "{step["stepKey"]}" is used by an earlier step'))
        seen_step_keys.add(step["stepKey"])
    return findings


def _unreachable_state_findings(reaction_document: Mapping[str, Any]) -> List[LintFinding]:
    steps = reaction_document["steps"]
    leaving_positions = _state_id_to_leaving_step_positions(reaction_document)
    reached = {reaction_document["startStateId"]}
    state_ids_to_visit = [reaction_document["startStateId"]]
    while state_ids_to_visit:
        for position in leaving_positions[state_ids_to_visit.pop()]:
            to_state_id = steps[position]["toStateId"]
            if to_state_id not in reached:
                reached.add(to_state_id)
                state_ids_to_visit.append(to_state_id)
    return [lint_error("state-unreachable", ["stateIdToState", state_id],
                       f'state "{state_id}": no route from the start state reaches it')
            for state_id in reaction_document["stateIdToState"] if state_id not in reached]


def _state_on_a_cycle(reaction_document: Mapping[str, Any]) -> Optional[str]:
    """A state that some steps lead back to, if any (depth-first search; a state still on the
    search path when it is met again closes a cycle)."""
    steps = reaction_document["steps"]
    leaving_positions = _state_id_to_leaving_step_positions(reaction_document)
    finished: Set[str] = set()
    on_path: Set[str] = set()

    def visit(state_id: str) -> Optional[str]:
        on_path.add(state_id)
        for position in leaving_positions[state_id]:
            to_state_id = steps[position]["toStateId"]
            if to_state_id in on_path:
                return str(to_state_id)
            if to_state_id not in finished:
                state_on_cycle = visit(to_state_id)
                if state_on_cycle is not None:
                    return state_on_cycle
        on_path.discard(state_id)
        finished.add(state_id)
        return None

    for state_id in reaction_document["stateIdToState"]:
        if state_id not in finished:
            state_on_cycle = visit(state_id)
            if state_on_cycle is not None:
                return state_on_cycle
    return None


def _cycle_findings(reaction_document: Mapping[str, Any]) -> List[LintFinding]:
    state_on_cycle = _state_on_a_cycle(reaction_document)
    if state_on_cycle is None:
        return []
    return [lint_error("mechanism-has-cycle", ["stateIdToState", state_on_cycle],
                       f'state "{state_on_cycle}": steps lead back to it; a reversible dead end '
                       "is a plausible misconception, not a step")]


def _product_state_ids(reaction_document: Mapping[str, Any]) -> List[str]:
    return [state_id for state_id, positions
            in _state_id_to_leaving_step_positions(reaction_document).items() if not positions]


def _product_state_findings(reaction_document: Mapping[str, Any]) -> List[LintFinding]:
    product_state_ids = _product_state_ids(reaction_document)
    if len(product_state_ids) == 1:
        return []
    return [lint_error("not-exactly-one-product-state", ["stateIdToState"],
                       f"{len(product_state_ids)} states have no step leaving them "
                       f"({', '.join(product_state_ids)}); every branch must rejoin at one "
                       "product state")]


def _preferred_step_findings(reaction_document: Mapping[str, Any]) -> List[LintFinding]:
    """Rule 4: at most one preferred step per state, and the preferred route reaches the
    product. The route is followed only when the first part holds and there is one product."""
    steps = reaction_document["steps"]
    state_id_to_preferred_positions = {
        state_id: [position for position in positions
                   if steps[position]["routePreference"] == "preferred"]
        for state_id, positions in _state_id_to_leaving_step_positions(reaction_document).items()}
    findings = [lint_error("several-preferred-steps-leave-state",
                           ["steps", position, "routePreference"],
                           f'step "{steps[position]["stepKey"]}": another preferred step already '
                           f'leaves state "{steps[position]["fromStateId"]}"')
                for positions in state_id_to_preferred_positions.values()
                for position in positions[1:]]
    product_state_ids = _product_state_ids(reaction_document)
    if findings or len(product_state_ids) != 1:
        return findings
    state_id = reaction_document["startStateId"]
    passed: Set[str] = set()
    while state_id_to_preferred_positions[state_id] and state_id not in passed:
        passed.add(state_id)
        state_id = steps[state_id_to_preferred_positions[state_id][0]]["toStateId"]
    if state_id == product_state_ids[0]:
        return []
    return [lint_error("preferred-route-does-not-reach-product", ["stateIdToState", state_id],
                       f'state "{state_id}": the route of preferred steps from the start state '
                       "stops here; mark one step leaving it preferred")]


def _change_step_findings(reaction_document: Mapping[str, Any]) -> List[LintFinding]:
    steps = reaction_document["steps"]
    return [lint_error("change-step-not-alone", ["steps", position],
                       f'change step "{steps[position]["stepKey"]}" must be the only step '
                       f'leaving state "{steps[position]["fromStateId"]}"')
            for positions in _state_id_to_leaving_step_positions(reaction_document).values()
            if len(positions) > 1
            for position in positions if steps[position]["stepKind"] == "change"]


def mechanism_graph_findings(reaction_document: Mapping[str, Any]) -> List[LintFinding]:
    """Every other rule of this module. Assumes every step's state ids exist."""
    return (_duplicate_step_key_findings(reaction_document)
            + _unreachable_state_findings(reaction_document)
            + _cycle_findings(reaction_document)
            + _product_state_findings(reaction_document)
            + _preferred_step_findings(reaction_document)
            + _change_step_findings(reaction_document))
