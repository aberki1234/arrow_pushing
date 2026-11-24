"""The catalogue build's command line: python -m catalogue_building (with python/ on PYTHONPATH).

Command
    build FILE... --out FOLDER (--previous-catalogue FILE | --start-new-calendar)
          [--build-date YYYY-MM-DD] [--built-at YYYY-MM-DDTHH:MM:SSZ]
        Read and lint the published reaction files, check them against the previous catalogue,
        extend the daily calendar and write catalogue.json plus r/<slug>/<version>.<hash>.json
        into FOLDER (new or empty). Lint warnings are printed. Exit status 1 with
        "error <error code>: <message>" if the build refuses; nothing is written then.
        --build-date and --built-at default to the current UTC date and time.
"""
import argparse
import json
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from catalogue_building.catalogue_assembly import assemble_catalogue
from catalogue_building.catalogue_build_errors import CatalogueBuildError
from catalogue_building.published_versions import (
    PublishedVersion,
    check_version_numbering,
    read_published_version,
)
from catalogue_building.site_writing import check_output_folder_usable, write_site

EXIT_SUCCESS = 0
EXIT_FAILURE = 1  # the build refused; argparse exits with 2 for a malformed command


def _read_previous_catalogue(catalogue_path: Path) -> Dict[str, Any]:
    try:
        previous_catalogue: Dict[str, Any] = json.loads(catalogue_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise CatalogueBuildError("previous-catalogue-not-readable",
                                  f"{catalogue_path}: {error}") from error
    return previous_catalogue


def _read_published_versions(reaction_paths: List[Path]) -> List[PublishedVersion]:
    """Every file read and linted; lint warnings are printed as the linter prints them."""
    published_versions = []
    for reaction_path in reaction_paths:
        published_version, lint_findings = read_published_version(reaction_path)
        for finding in lint_findings:
            print(f"{reaction_path}: {finding.lint_level} {finding.lint_rule_id}"
                  f" at {finding.instance_path or '/'}: {finding.message}")
        published_versions.append(published_version)
    check_version_numbering(published_versions)
    return published_versions


def _run_build(arguments: argparse.Namespace) -> None:
    """Every check runs before the first file is written, so a refused build writes nothing."""
    check_output_folder_usable(arguments.output_folder)
    previous_catalogue = (None if arguments.start_new_calendar
                          else _read_previous_catalogue(arguments.previous_catalogue))
    published_versions = _read_published_versions(arguments.reaction_files)
    now = datetime.now(UTC)
    build_date = arguments.build_date or now.date()
    built_at = arguments.built_at or now.strftime("%Y-%m-%dT%H:%M:%SZ")
    catalogue = assemble_catalogue(published_versions, previous_catalogue, build_date, built_at)
    write_site(arguments.output_folder, catalogue, published_versions)


def _built_at_text(argument_text: str) -> str:
    try:
        datetime.strptime(argument_text, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError as error:
        raise argparse.ArgumentTypeError("expected YYYY-MM-DDTHH:MM:SSZ (UTC)") from error
    return argument_text


def _argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m catalogue_building",
                                     description="Build the learner site's static catalogue.")
    commands = parser.add_subparsers(dest="command", required=True)
    build_command = commands.add_parser("build", help="build catalogue.json and reaction files")
    build_command.add_argument("reaction_files", nargs="+", type=Path,
                               help="every published reaction version file")
    build_command.add_argument("--out", required=True, type=Path, dest="output_folder",
                               help="a new or empty folder to write into")
    calendar_source = build_command.add_mutually_exclusive_group(required=True)
    calendar_source.add_argument("--previous-catalogue", type=Path,
                                 help="the previous build's catalogue.json (its calendar is kept)")
    calendar_source.add_argument("--start-new-calendar", action="store_true",
                                 help="no previous catalogue: start the calendar on the build date")
    build_command.add_argument("--build-date", type=date.fromisoformat,
                               help="YYYY-MM-DD; default: today in UTC")
    build_command.add_argument("--built-at", type=_built_at_text,
                               help="YYYY-MM-DDTHH:MM:SSZ; default: now in UTC")
    return parser


def main(argument_texts: Optional[Sequence[str]] = None) -> int:
    """Run one command; `argument_texts` defaults to sys.argv[1:]. Returns the exit status."""
    arguments = _argument_parser().parse_args(argument_texts)
    try:
        _run_build(arguments)
    except CatalogueBuildError as error:
        print(f"error {error.error_code}: {error}")
        return EXIT_FAILURE
    return EXIT_SUCCESS
