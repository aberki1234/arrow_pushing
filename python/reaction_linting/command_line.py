"""The linter's command line: python -m reaction_linting (with python/ on PYTHONPATH).

Commands
    lint FILE... [--json]
        Lint each reaction file. Prints one line per lint finding ("<file>: error <rule id> at
        <instance path>: <message>"), or with --json a list of lint reports
        ({"reactionFile", "lintFindings", "errorCount", "warningCount"}).
        Exit status 1 if any file has an error or cannot be read as JSON; warnings alone give 0.
    seed-coordinates FILE...
        Fill in RDKit coordinates for each state whose coordinates do not cover exactly its
        atoms, and write the file back (2-space JSON) if anything changed. Prints the states
        seeded. Exit status 1 if a file cannot be read as JSON.
"""
import argparse
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from reaction_linting.coordinate_seeding import seed_missing_coordinates
from reaction_linting.lint_findings import (
    LintFinding,
    LintLevel,
    lint_finding_to_json,
)
from reaction_linting.reaction_lint import lint_reaction

EXIT_SUCCESS = 0
EXIT_FAILURE = 1  # an error-level finding, or a file that is not JSON


def _read_reaction_file(reaction_path: Path) -> Dict[str, Any]:
    """Raises ValueError (json.JSONDecodeError is one) or OSError."""
    reaction_document: Dict[str, Any] = json.loads(reaction_path.read_text(encoding="utf-8"))
    return reaction_document


def _lint_file(reaction_path: Path) -> List[LintFinding]:
    """The file's findings; a file that cannot be read gives one file-not-readable error."""
    try:
        reaction_document = _read_reaction_file(reaction_path)
    except (OSError, ValueError) as error:
        return [LintFinding("file-not-readable", LintLevel.ERROR, "", str(error))]
    return lint_reaction(reaction_document)


def _lint_report(reaction_path: Path, lint_findings: List[LintFinding]) -> Dict[str, Any]:
    levels = [finding.lint_level for finding in lint_findings]
    return {"reactionFile": str(reaction_path),
            "lintFindings": [lint_finding_to_json(finding) for finding in lint_findings],
            "errorCount": levels.count(LintLevel.ERROR),
            "warningCount": levels.count(LintLevel.WARNING)}


def _run_lint(reaction_paths: List[Path], print_json: bool) -> int:
    reports = [_lint_report(path, _lint_file(path)) for path in reaction_paths]
    if print_json:
        print(json.dumps(reports, ensure_ascii=False, indent=2))
    else:
        for report in reports:
            for finding in report["lintFindings"]:
                print(f'{report["reactionFile"]}: {finding["lintLevel"]} {finding["lintRuleId"]}'
                      f' at {finding["instancePath"] or "/"}: {finding["message"]}')
    has_error = any(report["errorCount"] for report in reports)
    return EXIT_FAILURE if has_error else EXIT_SUCCESS


def _run_seed_coordinates(reaction_paths: List[Path]) -> int:
    exit_status = EXIT_SUCCESS
    for reaction_path in reaction_paths:
        try:
            reaction_document = _read_reaction_file(reaction_path)
        except (OSError, ValueError) as error:
            print(f"{reaction_path}: error file-not-readable: {error}")
            exit_status = EXIT_FAILURE
            continue
        seeded_state_ids = seed_missing_coordinates(reaction_document)
        if seeded_state_ids:
            reaction_path.write_text(
                json.dumps(reaction_document, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8")
            print(f"{reaction_path}: seeded {', '.join(seeded_state_ids)}")
    return exit_status


def _argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m reaction_linting",
                                     description="Check reaction files, or seed coordinates.")
    commands = parser.add_subparsers(dest="command", required=True)
    lint_command = commands.add_parser("lint", help="lint reaction files")
    lint_command.add_argument("reaction_files", nargs="+", type=Path)
    lint_command.add_argument("--json", action="store_true", dest="print_json",
                              help="print the lint reports as JSON")
    seed_command = commands.add_parser("seed-coordinates",
                                       help="fill in missing coordinates from RDKit")
    seed_command.add_argument("reaction_files", nargs="+", type=Path)
    return parser


def main(argument_texts: Optional[Sequence[str]] = None) -> int:
    """Run one command; `argument_texts` defaults to sys.argv[1:]. Returns the exit status."""
    arguments = _argument_parser().parse_args(argument_texts)
    if arguments.command == "lint":
        return _run_lint(arguments.reaction_files, arguments.print_json)
    return _run_seed_coordinates(arguments.reaction_files)
