"""Lint rules for abbreviated groups: bystander groups drawn as a short label such as "Ph"
(docs/schema-design.md section 3.1, `abbreviatedGroups`; decided 2026-11-25).

Terms
    abbreviated group  Atoms (`mapNumbers`) drawn as one label (`groupLabel`) wherever they hang off
                       the rest of a molecule by exactly one bond, which leaves the group from
                       `attachmentMapNumber`. The learner cannot tap anything in it, so no step may
                       need its atoms; validation still uses every atom.

Rules
    abbreviated-group-atoms-unknown       (error) a map number of the group is in no state
    abbreviated-group-not-attached-once   (error) in a state holding all its atoms, the group is
                                          not one connected piece joined to the rest by exactly one
                                          bond from its attachment atom
    arrow-touches-abbreviated-group       (error) a canonical arrow or partial arrow set uses an
                                          atom of the group (the attachment bond included)
    misconception-in-abbreviated-group    (warning) a misconception pattern names an atom of the
                                          group: the learner cannot draw it, so it never fires
"""
from typing import Any, Dict, FrozenSet, Iterable, List, Mapping, Set, Tuple, Union

from arrow_notation.curved_arrow_notation import CurvedArrow, parse_curved_arrow
from attempt_assessment.arrow_patterns import ArrowPatternError, parse_arrow_pattern
from state_graphs.mapped_smiles_reading import state_graph_from_mapped_smiles
from state_graphs.state_graph import StateGraph

from reaction_linting.lint_findings import LintFinding, lint_error, lint_warning

PathPart = Union[str, int]


def _groups(reaction_document: Mapping[str, Any]) -> List[Mapping[str, Any]]:
    groups: List[Mapping[str, Any]] = reaction_document.get("abbreviatedGroups", [])
    return groups


def _state_graphs(reaction_document: Mapping[str, Any]) -> Dict[str, StateGraph]:
    return {state_id: state_graph_from_mapped_smiles(state["mappedSmiles"])
            for state_id, state in reaction_document["stateIdToState"].items()}


def _group_attachment_problem(graph: StateGraph, group_atoms: FrozenSet[int],
                              attachment_map_number: int) -> str:
    """Why the group is not one piece joined by one bond from its attachment atom; "" if it is."""
    leaving_bonds = [(first, second) for first, second in graph.bond_to_order
                     if (first in group_atoms) != (second in group_atoms)]
    if len(leaving_bonds) != 1:
        return f"it is joined to the rest by {len(leaving_bonds)} bonds, not 1"
    if attachment_map_number not in leaving_bonds[0]:
        first, second = leaving_bonds[0]
        return (f"the bond joining it is {first}-{second}, which does not start at attachment "
                f"atom {attachment_map_number}")
    reached = {attachment_map_number}
    frontier = [attachment_map_number]
    while frontier:
        current = frontier.pop()
        for first, second in graph.bond_to_order:
            if current in (first, second):
                neighbour = second if first == current else first
                if neighbour in group_atoms and neighbour not in reached:
                    reached.add(neighbour)
                    frontier.append(neighbour)
    return "" if reached == group_atoms else "its atoms are not one connected piece"


def abbreviated_group_structure_findings(
        reaction_document: Mapping[str, Any]) -> List[LintFinding]:
    """abbreviated-group-atoms-unknown and abbreviated-group-not-attached-once."""
    graphs = _state_graphs(reaction_document)
    known_atoms = {map_number for graph in graphs.values()
                   for map_number in graph.map_number_to_atom}
    findings: List[LintFinding] = []
    for position, group in enumerate(_groups(reaction_document)):
        group_atoms = frozenset(group["mapNumbers"])
        path: List[PathPart] = ["abbreviatedGroups", position]
        unknown = sorted(group_atoms - known_atoms)
        if unknown:
            findings.append(lint_error("abbreviated-group-atoms-unknown", path,
                                       f"no state has map numbers {unknown}"))
            continue
        if group["attachmentMapNumber"] not in group_atoms:
            findings.append(lint_error(
                "abbreviated-group-not-attached-once", path,
                f"attachment atom {group['attachmentMapNumber']} is not one of the group's atoms"))
            continue
        for state_id, graph in graphs.items():
            if not group_atoms <= set(graph.map_number_to_atom):
                continue
            problem = _group_attachment_problem(graph, group_atoms, group["attachmentMapNumber"])
            if problem:
                findings.append(lint_error("abbreviated-group-not-attached-once", path,
                                           f"in state {state_id}, {problem}"))
                break
    return findings


def _arrow_atoms(curved_arrows: Iterable[CurvedArrow]) -> Set[int]:
    return {atom.map_number for curved_arrow in curved_arrows
            for locus in (curved_arrow.source, curved_arrow.destination) for atom in locus.atoms}


def _all_group_atoms(reaction_document: Mapping[str, Any]) -> FrozenSet[int]:
    return frozenset(map_number for group in _groups(reaction_document)
                     for map_number in group["mapNumbers"])


def _arrow_sets_of_step(step: Mapping[str, Any]) -> List[Tuple[List[PathPart], List[str]]]:
    """(path, arrow notations) for the step's canonical arrows and each partial arrow set."""
    arrow_sets: List[Tuple[List[PathPart], List[str]]] = [
        (["canonicalArrows"], step.get("canonicalArrows", []))]
    arrow_sets += [(["partialArrowSets", position], arrow_set)
                   for position, arrow_set in enumerate(step.get("partialArrowSets", []))]
    return arrow_sets


def abbreviated_group_arrow_findings(reaction_document: Mapping[str, Any]) -> List[LintFinding]:
    """arrow-touches-abbreviated-group and misconception-in-abbreviated-group."""
    group_atoms = _all_group_atoms(reaction_document)
    if not group_atoms:
        return []
    findings: List[LintFinding] = []
    for step_position, step in enumerate(reaction_document["steps"]):
        for path_tail, notations in _arrow_sets_of_step(step):
            touched = sorted(_arrow_atoms(map(parse_curved_arrow, notations)) & group_atoms)
            if touched:
                findings.append(lint_error(
                    "arrow-touches-abbreviated-group", ["steps", step_position, *path_tail],
                    f"these arrows use abbreviated atoms {touched}, which the learner cannot tap"))
    findings += _misconception_findings(reaction_document, group_atoms)
    return findings


def _pattern_map_numbers(pattern_text: str, roles: Dict[str, List[int]]) -> Set[int]:
    try:
        arrow_pattern = parse_arrow_pattern(pattern_text, roles)
    except ArrowPatternError:
        return set()  # reported by misconception-pattern-invalid
    return {map_number
            for single in arrow_pattern.single_arrow_patterns
            for locus in (single.source, single.destination)
            for selector in locus.atom_selectors
            for map_number in (selector.map_numbers or ())}


def _misconception_findings(reaction_document: Mapping[str, Any],
                            group_atoms: FrozenSet[int]) -> List[LintFinding]:
    roles: Dict[str, List[int]] = reaction_document.get("atomRoleToMapNumbers", {})
    findings: List[LintFinding] = []
    for state_id, state in reaction_document["stateIdToState"].items():
        for position, misconception in enumerate(state.get("misconceptions", [])):
            named = sorted(_pattern_map_numbers(misconception["arrowPattern"], roles) & group_atoms)
            if named:
                findings.append(lint_warning(
                    "misconception-in-abbreviated-group",
                    ["stateIdToState", state_id, "misconceptions", position],
                    f"the pattern names abbreviated atoms {named}; the learner cannot draw it"))
    return findings
