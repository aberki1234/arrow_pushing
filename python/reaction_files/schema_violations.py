"""Check a reaction file against the reaction schema (schema/reaction.schema.json).

The schema checks the shape of one reaction version: required keys, types, allowed values, the
arrow notation of each arrow string, and that change steps carry no arrows. It does not check the
chemistry or the mechanism graph (states reachable, branches rejoin, arrows reproduce states).

Terms
    reaction document   One reaction file, parsed from JSON into dicts and lists.
    schema violation    One place where the document breaks the schema: a JSON pointer to the
                        offending value (instance path, "" for the whole document) and a message.

Steps
    1. load_reaction_schema() reads the schema file.
    2. schema_violations() validates a document and lists every violation, including those
       found inside a failed "if/then" branch, sorted by instance path.
"""
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Mapping, Union

from jsonschema import Draft202012Validator, ValidationError

REACTION_SCHEMA_PATH = Path(__file__).resolve().parents[2] / "schema" / "reaction.schema.json"


@dataclass(frozen=True)
class SchemaViolation:
    """`instance_path` is a JSON pointer such as "/steps/0/routePreference"; "" means the whole
    document. `message` is the validator's text, for people; tests compare only the path."""
    instance_path: str
    message: str


def load_reaction_schema() -> Dict[str, Any]:
    """The reaction schema as parsed JSON."""
    reaction_schema: Dict[str, Any] = json.loads(REACTION_SCHEMA_PATH.read_text(encoding="utf-8"))
    return reaction_schema


def json_pointer(path_parts: Iterable[Union[str, int]]) -> str:
    """("steps", 0, "routePreference") -> "/steps/0/routePreference" (RFC 6901: "~" is written
    "~0" and "/" is written "~1" inside a key)."""
    escaped_parts = [str(part).replace("~", "~0").replace("/", "~1") for part in path_parts]
    return "".join(f"/{part}" for part in escaped_parts)


def _with_nested_errors(errors: Iterable[ValidationError]) -> Iterator[ValidationError]:
    """Each error, then the errors inside it. A failed "anyOf" or "oneOf" keeps the reasons each
    branch failed in `error.context`; the TypeScript validator reports those too."""
    for error in errors:
        yield error
        yield from _with_nested_errors(error.context or [])


def schema_violations(reaction_document: Mapping[str, Any]) -> List[SchemaViolation]:
    """Every schema violation in the document, sorted by instance path; empty if it is valid."""
    validator = Draft202012Validator(load_reaction_schema())
    distinct_violations = {
        SchemaViolation(instance_path=json_pointer(error.absolute_path), message=error.message)
        for error in _with_nested_errors(validator.iter_errors(reaction_document))}
    return sorted(distinct_violations,
                  key=lambda violation: (violation.instance_path, violation.message))
