"""Tests for command_line.py: exit statuses, the text and JSON reports, and rewriting files."""
import json
import shutil
from pathlib import Path
from typing import Any, Dict

import pytest
from reaction_linting.command_line import main

FIXTURES_FOLDER = Path(__file__).resolve().parents[2] / "fixtures"
SN2_REACTION_PATH = FIXTURES_FOLDER / "reactions" / "sn2-hydroxide-bromomethane.json"


def copied_sn2_reaction(folder: Path) -> Path:
    reaction_path = folder / "sn2.json"
    shutil.copy(SN2_REACTION_PATH, reaction_path)
    return reaction_path


def edit_file(reaction_path: Path, state_id: str, key: str, new_value: Any) -> None:
    reaction_document: Dict[str, Any] = json.loads(reaction_path.read_text(encoding="utf-8"))
    if new_value is None:
        del reaction_document["stateIdToState"][state_id][key]
    else:
        reaction_document["stateIdToState"][state_id][key] = new_value
    reaction_path.write_text(json.dumps(reaction_document), encoding="utf-8")


def test_clean_files_exit_zero_and_print_nothing(capsys: pytest.CaptureFixture[str]) -> None:
    example_paths = sorted(str(path) for path in (FIXTURES_FOLDER / "reactions").glob("*.json"))
    assert main(["lint", *example_paths]) == 0
    assert capsys.readouterr().out == ""


def test_an_error_exits_one_and_is_printed_with_file_rule_and_place(
        tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    reaction_path = copied_sn2_reaction(tmp_path)
    edit_file(reaction_path, "reactants", "learnerPrompt", None)
    assert main(["lint", str(reaction_path)]) == 1
    printed_line = capsys.readouterr().out.strip()
    assert printed_line.startswith(
        f"{reaction_path}: error learner-prompt-missing at /stateIdToState/reactants: ")


def test_a_warning_alone_exits_zero(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    reaction_path = copied_sn2_reaction(tmp_path)
    edit_file(reaction_path, "reactants", "hintTiers", ["One hint."])
    assert main(["lint", str(reaction_path)]) == 0
    assert "warning fewer-than-three-hint-tiers" in capsys.readouterr().out


def test_json_report(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    reaction_path = copied_sn2_reaction(tmp_path)
    edit_file(reaction_path, "reactants", "hintTiers", ["One hint."])
    assert main(["lint", "--json", str(reaction_path)]) == 0
    lint_reports = json.loads(capsys.readouterr().out)
    assert lint_reports == [{
        "reactionFile": str(reaction_path), "errorCount": 0, "warningCount": 1,
        "lintFindings": [{"lintRuleId": "fewer-than-three-hint-tiers", "lintLevel": "warning",
                          "instancePath": "/stateIdToState/reactants/hintTiers",
                          "message": lint_reports[0]["lintFindings"][0]["message"]}]}]


def test_a_file_that_is_not_json_exits_one(tmp_path: Path,
                                           capsys: pytest.CaptureFixture[str]) -> None:
    broken_path = tmp_path / "broken.json"
    broken_path.write_text("{ not json", encoding="utf-8")
    assert main(["lint", str(broken_path)]) == 1
    assert f"{broken_path}: error" in capsys.readouterr().out


def test_seed_coordinates_rewrites_only_a_file_that_changed(
        tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    reaction_path = copied_sn2_reaction(tmp_path)
    untouched_path = tmp_path / "untouched.json"
    shutil.copy(SN2_REACTION_PATH, untouched_path)
    edit_file(reaction_path, "products", "mapNumberToCoordinates", {})
    assert main(["seed-coordinates", str(reaction_path), str(untouched_path)]) == 0
    assert f"{reaction_path}: seeded products" in capsys.readouterr().out
    assert untouched_path.read_bytes() == SN2_REACTION_PATH.read_bytes()
    assert main(["lint", str(reaction_path)]) == 0
