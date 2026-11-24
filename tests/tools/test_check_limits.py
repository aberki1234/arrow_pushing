"""Tests for tools/check_limits.py.

Each test builds a small project in a temporary folder (a pyproject.toml plus Python files) and
checks which violations are reported. The expected sizes are counted by hand from the generated
source.
"""
from pathlib import Path
from typing import Dict, List

import pytest
from check_limits import (
    SizeLimits,
    load_size_limit_config,
    main,
    python_files_to_check,
    size_limit_violations,
)


def write_pyproject(project_root: Path, baseline: Dict[str, int] | None = None,
                    excluded_path_fragments: List[str] | None = None) -> None:
    """Write a pyproject.toml with small limits: functions 5 lines, files 20 lines, dataclasses 2
    fields."""
    baseline_lines = "\n".join(f'"{key}" = {value}' for key, value in (baseline or {}).items())
    excluded = ", ".join(f'"{fragment}"' for fragment in (excluded_path_fragments or []))
    (project_root / "pyproject.toml").write_text(
        "[tool.size_limits]\n"
        "max_function_lines = 5\n"
        "max_file_lines = 20\n"
        "max_dataclass_fields = 2\n"
        'checked_paths = ["src", "missing_folder"]\n'
        f"excluded_path_fragments = [{excluded}]\n"
        "[tool.size_limits.dataclass_field_baseline]\n"
        f"{baseline_lines}\n",
        encoding="utf-8")


def write_source(project_root: Path, relative_path: str, source: str) -> Path:
    file_path = project_root / relative_path
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(source, encoding="utf-8")
    return file_path


def function_with_body_lines(name: str, body_line_count: int) -> str:
    """A function whose total length is body_line_count + 1 (the def line)."""
    body = "".join(f"    value_{i} = {i}\n" for i in range(body_line_count))
    return f"def {name}() -> None:\n{body}"


def dataclass_with_fields(name: str, field_count: int) -> str:
    fields = "".join(f"    field_{i}: int\n" for i in range(field_count))
    return f"from dataclasses import dataclass\n\n@dataclass\nclass {name}:\n{fields}"


SMALL_LIMITS = SizeLimits(max_function_lines=5, max_file_lines=20, max_dataclass_fields=2,
                          dataclass_to_allowed_fields={})


def test_load_size_limit_config_reads_limits_paths_and_baseline(tmp_path: Path) -> None:
    write_pyproject(tmp_path, baseline={"src/old.py::Wide": 4},
                    excluded_path_fragments=["generated"])
    config = load_size_limit_config(tmp_path)
    assert config.limits == SizeLimits(5, 20, 2, {"src/old.py::Wide": 4})
    assert config.checked_paths == ["src", "missing_folder"]
    assert config.excluded_path_fragments == ["generated"]


def test_python_files_to_check_skips_missing_paths_excluded_files_and_non_python(
        tmp_path: Path) -> None:
    write_pyproject(tmp_path, excluded_path_fragments=["generated"])
    write_source(tmp_path, "src/b_module.py", "")
    write_source(tmp_path, "src/a_module.py", "")
    write_source(tmp_path, "src/nested/generated_code.py", "")
    write_source(tmp_path, "src/notes.txt", "")
    found = list(python_files_to_check(tmp_path, load_size_limit_config(tmp_path)))
    assert found == [tmp_path / "src/a_module.py", tmp_path / "src/b_module.py"]


def test_function_at_the_limit_passes_and_one_line_over_fails(tmp_path: Path) -> None:
    at_limit = write_source(tmp_path, "src/at_limit.py", function_with_body_lines("fits", 4))
    over_limit = write_source(tmp_path, "src/over_limit.py",
                              function_with_body_lines("too_long", 5))
    assert size_limit_violations(tmp_path, at_limit, SMALL_LIMITS) == []
    assert size_limit_violations(tmp_path, over_limit, SMALL_LIMITS) == [
        "src/over_limit.py:1: too_long() has 6 lines (max 5)"]


def test_method_inside_a_class_is_measured_too(tmp_path: Path) -> None:
    method = function_with_body_lines("long_method", 5).replace("\n", "\n    ").replace(
        "() -> None", "(self) -> None")
    file_path = write_source(tmp_path, "src/with_class.py", "class Holder:\n    " + method)
    assert size_limit_violations(tmp_path, file_path, SMALL_LIMITS) == [
        "src/with_class.py:2: long_method() has 6 lines (max 5)"]


def test_file_over_the_line_limit_fails(tmp_path: Path) -> None:
    file_path = write_source(tmp_path, "src/long_file.py", "value = 1\n" * 21)
    assert size_limit_violations(tmp_path, file_path, SMALL_LIMITS) == [
        "src/long_file.py: file has 21 lines (max 20)"]


def test_dataclass_over_the_field_limit_fails_and_a_plain_class_does_not(tmp_path: Path) -> None:
    wide = write_source(tmp_path, "src/wide.py", dataclass_with_fields("Wide", 3))
    plain = write_source(tmp_path, "src/plain.py",
                         "class Plain:\n    first: int\n    second: int\n    third: int\n")
    assert size_limit_violations(tmp_path, wide, SMALL_LIMITS) == [
        "src/wide.py:4: Wide has 3 fields (max 2); group related fields into a smaller dataclass"]
    assert size_limit_violations(tmp_path, plain, SMALL_LIMITS) == []


def test_frozen_dataclass_decorator_call_is_recognised(tmp_path: Path) -> None:
    source = dataclass_with_fields("Wide", 3).replace("@dataclass", "@dataclass(frozen=True)")
    file_path = write_source(tmp_path, "src/frozen.py", source)
    assert len(size_limit_violations(tmp_path, file_path, SMALL_LIMITS)) == 1


def test_baseline_lets_an_existing_dataclass_keep_its_fields_but_not_grow(tmp_path: Path) -> None:
    limits = SizeLimits(5, 20, 2, {"src/old.py::Wide": 3})
    keeps = write_source(tmp_path, "src/old.py", dataclass_with_fields("Wide", 3))
    assert size_limit_violations(tmp_path, keeps, limits) == []
    grows = write_source(tmp_path, "src/old.py", dataclass_with_fields("Wide", 4))
    assert size_limit_violations(tmp_path, grows, limits) == [
        "src/old.py:4: Wide has 4 fields (max 3); group related fields into a smaller dataclass"]


def test_main_returns_one_and_prints_violations_when_any_exist(
        tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    write_pyproject(tmp_path)
    write_source(tmp_path, "src/over_limit.py", function_with_body_lines("too_long", 5))
    assert main(tmp_path) == 1
    assert "too_long() has 6 lines" in capsys.readouterr().out


def test_main_returns_zero_for_a_clean_project(tmp_path: Path) -> None:
    write_pyproject(tmp_path)
    write_source(tmp_path, "src/fits.py", function_with_body_lines("fits", 2))
    assert main(tmp_path) == 0
