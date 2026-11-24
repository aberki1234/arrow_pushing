"""Tests for command_line.py and site_writing.py: whole builds on the example reactions."""
import hashlib
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Callable, Dict, List

import pytest
from catalogue_building.catalogue_assembly import catalogue_schema_violation_paths
from catalogue_building.command_line import main
from catalogue_building.static_file_naming import canonical_json_bytes

REACTIONS_FOLDER = Path(__file__).resolve().parents[2] / "fixtures" / "reactions"
ReactionCopier = Callable[..., Path]  # the copy_reaction fixture in conftest.py


def read_json(json_path: Path) -> Dict[str, Any]:
    document: Dict[str, Any] = json.loads(json_path.read_text(encoding="utf-8"))
    return document


EXAMPLE_PATHS = sorted(str(path) for path in REACTIONS_FOLDER.glob("*.json"))
FIXED_TIMES = ["--build-date", "2026-12-01", "--built-at", "2026-12-01T10:00:00Z"]


def build(input_paths: List[str], output_folder: Path, *options: str) -> int:
    return main(["build", *input_paths, "--out", str(output_folder), *options])


def first_site(tmp_path: Path) -> Path:
    output_folder = tmp_path / "first_site"
    assert build(EXAMPLE_PATHS, output_folder, "--start-new-calendar", *FIXED_TIMES) == 0
    return output_folder


def test_a_new_build_writes_the_catalogue_and_one_hashed_file_per_version(
        tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    output_folder = first_site(tmp_path)
    assert capsys.readouterr().out == ""
    catalogue = read_json(output_folder / "catalogue.json")
    assert catalogue_schema_violation_paths(catalogue) == []
    assert catalogue["builtAt"] == "2026-12-01T10:00:00Z"
    assert list(catalogue["dateToDailyReactionVersionRef"])[0] == "2026-12-01"
    written_paths = sorted(str(path.relative_to(output_folder))
                           for path in (output_folder / "r").rglob("*.json"))
    expected_paths = []
    for entry in catalogue["reactions"]:
        content_hash = entry["reactionVersionToContentHash"]["1"]
        reaction_file = output_folder / "r" / entry["reactionSlug"] / f"1.{content_hash[:8]}.json"
        file_bytes = reaction_file.read_bytes()
        assert hashlib.sha256(file_bytes).hexdigest() == content_hash
        source_document = read_json(REACTIONS_FOLDER / f'{entry["reactionSlug"]}.json')
        assert file_bytes == canonical_json_bytes(source_document)
        expected_paths.append(str(reaction_file.relative_to(output_folder)))
    assert written_paths == sorted(expected_paths)
    assert len(written_paths) == len(EXAMPLE_PATHS)


def test_a_later_build_keeps_the_calendar_and_adds_a_new_version(
        tmp_path: Path, copy_reaction: ReactionCopier) -> None:
    previous_catalogue_path = first_site(tmp_path) / "catalogue.json"
    second_version = copy_reaction("sn2-hydroxide-bromomethane", reactionVersion=2,
                                   previousReactionVersion=1, title="SN2 (revised)")
    output_folder = tmp_path / "second_site"
    exit_status = build([*EXAMPLE_PATHS, str(second_version)], output_folder,
                        "--previous-catalogue", str(previous_catalogue_path),
                        "--build-date", "2026-12-20", "--built-at", "2026-12-20T09:00:00Z")
    assert exit_status == 0
    previous_calendar = read_json(previous_catalogue_path)["dateToDailyReactionVersionRef"]
    catalogue = read_json(output_folder / "catalogue.json")
    calendar = catalogue["dateToDailyReactionVersionRef"]
    assert {day: calendar[day] for day in previous_calendar} == previous_calendar
    assert "sn2-hydroxide-bromomethane@2" in calendar.values()
    sn2_entry = next(entry for entry in catalogue["reactions"]
                     if entry["reactionSlug"] == "sn2-hydroxide-bromomethane")
    assert sn2_entry["latestReactionVersion"] == 2
    assert sn2_entry["title"] == "SN2 (revised)"
    assert len(list((output_folder / "r" / "sn2-hydroxide-bromomethane").iterdir())) == 2


def refused_build(capsys: pytest.CaptureFixture[str], output_folder: Path,
                  arguments: List[str]) -> str:
    """Run a build that must refuse; return the printed error line. Nothing may be written."""
    files_before = sorted(output_folder.rglob("*")) if output_folder.exists() else []
    assert main(arguments) == 1
    files_after = sorted(output_folder.rglob("*")) if output_folder.exists() else []
    assert files_after == files_before
    return capsys.readouterr().out.strip().splitlines()[-1]


def test_a_lint_error_refuses_the_whole_build(
        tmp_path: Path, copy_reaction: ReactionCopier,
        capsys: pytest.CaptureFixture[str]) -> None:
    broken_path = copy_reaction("aldol-addition-base", difficultyTier=9)
    output_folder = tmp_path / "site"
    printed = refused_build(capsys, output_folder,
                            ["build", EXAMPLE_PATHS[0], str(broken_path), "--out",
                             str(output_folder), "--start-new-calendar", *FIXED_TIMES])
    assert printed.startswith("error reaction-file-has-lint-errors: ")


def test_a_non_empty_output_folder_is_refused(
        tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    output_folder = tmp_path / "site"
    output_folder.mkdir()
    (output_folder / "old.txt").write_text("keep me", encoding="utf-8")
    printed = refused_build(capsys, output_folder,
                            ["build", *EXAMPLE_PATHS, "--out", str(output_folder),
                             "--start-new-calendar", *FIXED_TIMES])
    assert printed.startswith("error output-folder-not-empty: ")


def test_an_empty_existing_output_folder_is_used(tmp_path: Path) -> None:
    output_folder = tmp_path / "site"
    output_folder.mkdir()
    assert build(EXAMPLE_PATHS, output_folder, "--start-new-calendar", *FIXED_TIMES) == 0
    assert (output_folder / "catalogue.json").exists()


def test_a_missing_previous_catalogue_is_refused(
        tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    output_folder = tmp_path / "site"
    printed = refused_build(capsys, output_folder,
                            ["build", *EXAMPLE_PATHS, "--out", str(output_folder),
                             "--previous-catalogue", str(tmp_path / "nowhere.json")])
    assert printed.startswith("error previous-catalogue-not-readable: ")


def test_a_dropped_version_is_refused(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    previous_catalogue_path = first_site(tmp_path) / "catalogue.json"
    output_folder = tmp_path / "site"
    printed = refused_build(capsys, output_folder,
                            ["build", *EXAMPLE_PATHS[1:], "--out", str(output_folder),
                             "--previous-catalogue", str(previous_catalogue_path)])
    assert printed.startswith("error published-version-missing: ")


@pytest.mark.parametrize("calendar_options", [
    [], ["--start-new-calendar", "--previous-catalogue", "catalogue.json"]])
def test_exactly_one_of_previous_catalogue_and_new_calendar_is_required(
        tmp_path: Path, calendar_options: List[str]) -> None:
    with pytest.raises(SystemExit) as raised:
        build(EXAMPLE_PATHS, tmp_path / "site", *calendar_options)
    assert raised.value.code == 2


def test_lint_warnings_are_printed_and_do_not_block(
        tmp_path: Path, copy_reaction: ReactionCopier,
        capsys: pytest.CaptureFixture[str]) -> None:
    warned_path = copy_reaction("sn2-hydroxide-bromomethane")
    document: Dict[str, Any] = read_json(warned_path)
    document["stateIdToState"]["reactants"]["hintTiers"] = ["One hint."]
    warned_path.write_text(json.dumps(document), encoding="utf-8")
    assert build([str(warned_path)], tmp_path / "site", "--start-new-calendar", *FIXED_TIMES) == 0
    assert (f"{warned_path}: warning fewer-than-three-hint-tiers at /stateIdToState/reactants"
            in capsys.readouterr().out)


def test_build_date_and_time_default_to_now_in_utc(tmp_path: Path) -> None:
    output_folder = tmp_path / "site"
    assert build(EXAMPLE_PATHS[:1], output_folder, "--start-new-calendar") == 0
    catalogue = read_json(output_folder / "catalogue.json")
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", catalogue["builtAt"])
    today_in_utc = datetime.now(UTC).date().isoformat()
    assert list(catalogue["dateToDailyReactionVersionRef"])[0] == today_in_utc
