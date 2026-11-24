"""What the linter reports: one lint finding per broken rule.

Terms (docs/schema-design.md section 0)
    lint finding   One broken lint rule at one place in a reaction file: the rule id, the lint
                   level, a JSON pointer to the place, and a message for the author.
    lint level     "error" blocks submission (shown as a cross in the editor's lint panel);
                   "warning" is advice. Not to be confused with a misconception's severity
                   (wrong / plausible).
    instance path  A JSON pointer such as "/steps/0/canonicalArrows" ("" is the whole file), as
                   in reaction_files.schema_violations.
"""
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Dict, Sequence, Union

from reaction_files.schema_violations import json_pointer


class LintLevel(StrEnum):
    """The values are the JSON spellings in the lint report."""
    ERROR = "error"
    WARNING = "warning"


@dataclass(frozen=True)
class LintFinding:
    lint_rule_id: str
    lint_level: LintLevel
    instance_path: str
    message: str


def lint_finding_to_json(lint_finding: LintFinding) -> Dict[str, Any]:
    """{"lintRuleId", "lintLevel", "instancePath", "message"}."""
    return {"lintRuleId": lint_finding.lint_rule_id, "lintLevel": str(lint_finding.lint_level),
            "instancePath": lint_finding.instance_path, "message": lint_finding.message}


def lint_error(lint_rule_id: str, path_parts: Sequence[Union[str, int]],
               message: str) -> LintFinding:
    """An error-level finding at the JSON pointer made from `path_parts` (keys and positions)."""
    return LintFinding(lint_rule_id, LintLevel.ERROR, json_pointer(path_parts), message)


def lint_warning(lint_rule_id: str, path_parts: Sequence[Union[str, int]],
                 message: str) -> LintFinding:
    """A warning-level finding at the JSON pointer made from `path_parts`."""
    return LintFinding(lint_rule_id, LintLevel.WARNING, json_pointer(path_parts), message)
