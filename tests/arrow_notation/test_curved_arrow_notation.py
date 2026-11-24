"""Tests for python/arrow_notation/curved_arrow_notation.py.

The shared cases in fixtures/notation/curved_arrows.json are the reference; the TypeScript tests run
the same cases. Every arrow written in the example reactions must parse, and the parser must agree
with the arrow regex in the reaction schema about what is syntactically valid.
"""
import json
import re
from pathlib import Path
from typing import Any, Dict, Iterator, List

import pytest
from arrow_notation.curved_arrow_notation import (
    ArrowNotationError,
    AtomLabel,
    CurvedArrow,
    ElectronLocus,
    LocusKind,
    format_curved_arrow,
    format_electron_locus,
    parse_curved_arrow,
    parse_electron_locus,
)

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
NOTATION_CASES: Dict[str, Any] = json.loads(
    (REPOSITORY_ROOT / "fixtures" / "notation" / "curved_arrows.json").read_text(encoding="utf-8"))
VALID_CASES: List[Dict[str, Any]] = NOTATION_CASES["validCases"]
INVALID_CASES: List[Dict[str, Any]] = NOTATION_CASES["invalidCases"]
SYNTAX_ERROR_CODES: List[str] = NOTATION_CASES["syntaxErrorCodes"]


def locus_to_json(locus: ElectronLocus) -> Dict[str, Any]:
    """The fixture spelling of a locus (camelCase keys, as in TypeScript)."""
    return {"locusKind": str(locus.locus_kind),
            "atoms": [{"element": atom.element, "mapNumber": atom.map_number}
                      for atom in locus.atoms]}


def curved_arrow_to_json(curved_arrow: CurvedArrow) -> Dict[str, Any]:
    return {"electronsMoved": curved_arrow.electrons_moved,
            "source": locus_to_json(curved_arrow.source),
            "destination": locus_to_json(curved_arrow.destination)}


def arrows_written_in(reaction_document: Dict[str, Any]) -> Iterator[str]:
    """Every arrow string in a reaction file: canonical arrows, partial arrow sets, and the
    learner arrows of partial-progress messages."""
    for step in reaction_document["steps"]:
        yield from step.get("canonicalArrows", [])
        for partial_arrow_set in step.get("partialArrowSets", []):
            yield from partial_arrow_set
    for state in reaction_document["stateIdToState"].values():
        for message in state.get("partialProgressMessages", []):
            yield from message["learnerArrows"]


EXAMPLE_ARROWS = sorted({
    arrow
    for reaction_path in (REPOSITORY_ROOT / "fixtures" / "reactions").glob("*.json")
    for arrow in arrows_written_in(json.loads(reaction_path.read_text(encoding="utf-8")))})


@pytest.mark.parametrize("case", VALID_CASES, ids=[case["notation"] for case in VALID_CASES])
def test_valid_notation_parses_to_the_expected_structure(case: Dict[str, Any]) -> None:
    assert curved_arrow_to_json(parse_curved_arrow(case["notation"])) == case["curvedArrow"]


@pytest.mark.parametrize("case", VALID_CASES, ids=[case["notation"] for case in VALID_CASES])
def test_valid_notation_prints_in_the_printed_form(case: Dict[str, Any]) -> None:
    assert format_curved_arrow(parse_curved_arrow(case["notation"])) == case["printed"]


@pytest.mark.parametrize("case", VALID_CASES, ids=[case["notation"] for case in VALID_CASES])
def test_printing_then_parsing_gives_the_same_arrow(case: Dict[str, Any]) -> None:
    curved_arrow = parse_curved_arrow(case["notation"])
    assert parse_curved_arrow(format_curved_arrow(curved_arrow)) == curved_arrow


@pytest.mark.parametrize("case", INVALID_CASES,
                         ids=[repr(case["notation"]) for case in INVALID_CASES])
def test_invalid_notation_is_refused_with_the_expected_code(case: Dict[str, Any]) -> None:
    with pytest.raises(ArrowNotationError) as raised:
        parse_curved_arrow(case["notation"])
    assert raised.value.error_code == case["expectedErrorCode"]


def test_error_is_a_value_error_and_its_message_quotes_the_notation() -> None:
    with pytest.raises(ValueError, match="lp O1 => σ O1-C2"):
        parse_curved_arrow("lp O1 => σ O1-C2")


@pytest.mark.parametrize("arrow", EXAMPLE_ARROWS)
def test_every_arrow_in_the_example_reactions_parses(arrow: str) -> None:
    parse_curved_arrow(arrow)


def test_parse_electron_locus_orders_bond_atoms_by_map_number() -> None:
    assert parse_electron_locus("σ Br3-C2") == ElectronLocus(
        LocusKind.SIGMA_BOND, (AtomLabel("C", 2), AtomLabel("Br", 3)))


def test_parse_electron_locus_refuses_a_whole_arrow() -> None:
    with pytest.raises(ArrowNotationError) as raised:
        parse_electron_locus("lp O1 -> σ O1-C2")
    assert raised.value.error_code == "malformed-locus"


def test_format_electron_locus_uses_symbols_for_bonds() -> None:
    assert format_electron_locus(parse_electron_locus("pi C5-O6")) == "π C5-O6"
    assert format_electron_locus(parse_electron_locus("rad C3")) == "rad C3"


def _schema_arrow_patterns() -> List[re.Pattern[str]]:
    schema = json.loads((REPOSITORY_ROOT / "schema" / "reaction.schema.json").read_text(
        encoding="utf-8"))
    return [re.compile(schema["$defs"][name]["pattern"]) for name in ("pairArrow", "fishHookArrow")]


@pytest.mark.parametrize("case", VALID_CASES, ids=[case["notation"] for case in VALID_CASES])
def test_schema_regex_accepts_every_valid_notation(case: Dict[str, Any]) -> None:
    assert any(pattern.search(case["notation"]) for pattern in _schema_arrow_patterns())


@pytest.mark.parametrize(
    "case", [case for case in INVALID_CASES if case["expectedErrorCode"] in SYNTAX_ERROR_CODES],
    ids=repr)
def test_schema_regex_refuses_every_syntax_error(case: Dict[str, Any]) -> None:
    """Only syntax errors: the schema cannot see that "lp O1 -> lp O1" points at itself."""
    assert not any(pattern.search(case["notation"]) for pattern in _schema_arrow_patterns())
