"""Fail if a Python function, file or dataclass is larger than the size limits in pyproject.toml.

Ruff has no rule for the length of a function or a file. Its max-args rule cannot see the __init__
that @dataclass generates, which takes one argument per field. This script checks those three sizes.

Terms
    size limits   [tool.size_limits] in pyproject.toml: max_function_lines, max_file_lines,
                  max_dataclass_fields.
    baseline      [tool.size_limits.dataclass_field_baseline]: "path/to/file.py::ClassName" -> the
                  number of fields an existing, larger dataclass may keep. It may shrink,
                  never grow.
    violation     One line of text naming the file, the line and what is too large.

Steps
    1. load_size_limit_config() reads the limits and which paths to check.
    2. python_files_to_check() lists the .py files under those paths, without the excluded ones.
    3. size_limit_violations() measures one file: its length, each function, each dataclass.
    4. main() prints every violation and returns 1 if there was any, else 0.
"""
import ast
import sys
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterator, List

PROJECT_ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class SizeLimits:
    """The largest allowed sizes. `dataclass_to_allowed_fields` is the baseline, keyed by
    "path/relative/to/project/root.py::ClassName"."""
    max_function_lines: int
    max_file_lines: int
    max_dataclass_fields: int
    dataclass_to_allowed_fields: Dict[str, int]


@dataclass(frozen=True)
class SizeLimitConfig:
    """The limits, plus which paths (relative to the project root) are checked. A file whose path
    contains any of `excluded_path_fragments` is skipped."""
    limits: SizeLimits
    checked_paths: List[str]
    excluded_path_fragments: List[str]


def load_size_limit_config(project_root: Path) -> SizeLimitConfig:
    """Read [tool.size_limits] from `project_root`/pyproject.toml."""
    with open(project_root / "pyproject.toml", "rb") as pyproject_file:
        size_limit_table = tomllib.load(pyproject_file)["tool"]["size_limits"]
    limits = SizeLimits(
        max_function_lines=int(size_limit_table["max_function_lines"]),
        max_file_lines=int(size_limit_table["max_file_lines"]),
        max_dataclass_fields=int(size_limit_table["max_dataclass_fields"]),
        dataclass_to_allowed_fields=dict(size_limit_table.get("dataclass_field_baseline", {})))
    return SizeLimitConfig(
        limits=limits,
        checked_paths=list(size_limit_table["checked_paths"]),
        excluded_path_fragments=list(size_limit_table.get("excluded_path_fragments", [])))


def python_files_to_check(project_root: Path, config: SizeLimitConfig) -> Iterator[Path]:
    """Yield every .py file under the checked paths, sorted, skipping excluded ones.
    A checked path that does not exist is skipped (a package folder may not exist yet)."""
    for checked_path in config.checked_paths:
        checked_location = project_root / checked_path
        if checked_location.is_file():
            candidate_files = [checked_location]
        else:
            candidate_files = sorted(checked_location.rglob("*.py"))
        for candidate_file in candidate_files:
            is_excluded = any(fragment in str(candidate_file)
                              for fragment in config.excluded_path_fragments)
            if not is_excluded:
                yield candidate_file


def _is_dataclass(class_node: ast.ClassDef) -> bool:
    """True if any decorator mentions `dataclass`: @dataclass, @dataclass(...) or
    @dataclasses.dataclass."""
    for decorator in class_node.decorator_list:
        decorator_target = decorator.func if isinstance(decorator, ast.Call) else decorator
        if "dataclass" in ast.dump(decorator_target):
            return True
    return False


def _function_violations(relative_path: str, syntax_tree: ast.AST,
                         limits: SizeLimits) -> List[str]:
    violations = []
    for node in ast.walk(syntax_tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            last_line = node.end_lineno or node.lineno
            function_line_count = last_line - node.lineno + 1
            if function_line_count > limits.max_function_lines:
                violations.append(f"{relative_path}:{node.lineno}: {node.name}() has "
                                  f"{function_line_count} lines (max {limits.max_function_lines})")
    return violations


def _dataclass_violations(relative_path: str, syntax_tree: ast.AST,
                          limits: SizeLimits) -> List[str]:
    """A dataclass may have `max_dataclass_fields`, or more if the baseline allows it."""
    violations = []
    for node in ast.walk(syntax_tree):
        if isinstance(node, ast.ClassDef) and _is_dataclass(node):
            # Each annotated assignment in the class body is one field.
            field_count = sum(isinstance(statement, ast.AnnAssign) for statement in node.body)
            baseline_allowance = limits.dataclass_to_allowed_fields.get(
                f"{relative_path}::{node.name}", 0)
            allowed_field_count = max(limits.max_dataclass_fields, baseline_allowance)
            if field_count > allowed_field_count:
                violations.append(f"{relative_path}:{node.lineno}: {node.name} has {field_count} "
                                  f"fields (max {allowed_field_count}); "
                                  "group related fields into a smaller dataclass")
    return violations


def size_limit_violations(project_root: Path, file_path: Path, limits: SizeLimits) -> List[str]:
    """Every size violation in one file, as "<relative path>:<line>: <what>" text lines.
    A function's length counts from its `def` line to its last line, decorators excluded."""
    source = file_path.read_text(encoding="utf-8")
    relative_path = file_path.relative_to(project_root).as_posix()
    violations = []
    file_line_count = len(source.splitlines())
    if file_line_count > limits.max_file_lines:
        violations.append(
            f"{relative_path}: file has {file_line_count} lines (max {limits.max_file_lines})")
    syntax_tree = ast.parse(source)
    violations += _dataclass_violations(relative_path, syntax_tree, limits)
    violations += _function_violations(relative_path, syntax_tree, limits)
    return violations


def main(project_root: Path = PROJECT_ROOT) -> int:
    """Print every violation in the project; return 1 if there was any, else 0."""
    config = load_size_limit_config(project_root)
    violations: List[str] = []
    for file_path in python_files_to_check(project_root, config):
        violations += size_limit_violations(project_root, file_path, config.limits)
    if violations:
        print("\n".join(violations))
    return 1 if violations else 0


if __name__ == "__main__":
    sys.exit(main())
