"""Tests for tools/check_layers.py.

Each test builds a small source tree in a temporary folder with two layers, `chemistry` (lowest) and
`learner_site`, plus an entry-point script, and checks the problems reported.
"""
from pathlib import Path

import pytest
from check_layers import (
    ImportEdge,
    LayerConfig,
    discover_modules,
    import_cycles,
    import_edges,
    layer_violations,
    load_layer_config,
    main,
)

LAYERS_LOWEST_FIRST = ["chemistry", "learner_site"]


def write_pyproject(project_root: Path) -> None:
    (project_root / "pyproject.toml").write_text(
        '[tool.layers]\nsource_root = "python"\n'
        'layers_lowest_first = ["chemistry", "learner_site"]\n',
        encoding="utf-8")


def write_module(project_root: Path, relative_path: str, source: str = "") -> Path:
    file_path = project_root / "python" / relative_path
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(source, encoding="utf-8")
    return file_path


def test_load_layer_config_reads_source_root_and_order(tmp_path: Path) -> None:
    write_pyproject(tmp_path)
    assert load_layer_config(tmp_path) == LayerConfig(tmp_path / "python", LAYERS_LOWEST_FIRST)


def test_discover_modules_finds_layer_modules_and_scripts_but_not_init_or_undeclared(
        tmp_path: Path) -> None:
    write_module(tmp_path, "chemistry/__init__.py")
    arrows = write_module(tmp_path, "chemistry/arrows.py")
    script = write_module(tmp_path, "build_site.py")
    write_module(tmp_path, "undeclared_package/module.py")
    found = discover_modules(LayerConfig(tmp_path / "python", LAYERS_LOWEST_FIRST))
    assert found == {"chemistry.arrows": arrows, "build_site": script}


def test_discover_modules_with_missing_source_root_is_empty(tmp_path: Path) -> None:
    assert discover_modules(LayerConfig(tmp_path / "python", LAYERS_LOWEST_FIRST)) == {}


def test_import_edges_include_from_imports_plain_imports_and_imports_inside_functions(
        tmp_path: Path) -> None:
    arrows = write_module(tmp_path, "chemistry/arrows.py")
    graph = write_module(tmp_path, "chemistry/graph.py")
    page = write_module(tmp_path, "learner_site/page.py",
                        "from chemistry import arrows\n"
                        "import chemistry.graph\n"
                        "def render() -> None:\n"
                        "    import chemistry.arrows\n")
    module_name_to_path = {"chemistry.arrows": arrows, "chemistry.graph": graph,
                           "learner_site.page": page}
    assert import_edges(module_name_to_path) == [
        ImportEdge("learner_site.page", "chemistry.arrows", 1),
        ImportEdge("learner_site.page", "chemistry.graph", 2),
        ImportEdge("learner_site.page", "chemistry.arrows", 4),
    ]


def test_lower_layer_importing_a_higher_layer_is_a_violation() -> None:
    edges = [ImportEdge("chemistry.arrows", "learner_site.page", 3)]
    assert layer_violations(edges, LAYERS_LOWEST_FIRST) == [
        "chemistry.arrows:3 imports learner_site.page (chemistry must not depend on learner_site)"]


def test_higher_layer_importing_a_lower_one_and_imports_within_a_package_are_allowed() -> None:
    edges = [ImportEdge("learner_site.page", "chemistry.arrows", 1),
             ImportEdge("chemistry.graph", "chemistry.arrows", 2)]
    assert layer_violations(edges, LAYERS_LOWEST_FIRST) == []


def test_importing_an_entry_point_script_is_a_violation() -> None:
    edges = [ImportEdge("learner_site.page", "build_site", 5)]
    assert layer_violations(edges, LAYERS_LOWEST_FIRST) == [
        "learner_site.page:5 imports entry-point script build_site"]


def test_an_entry_point_script_may_import_any_layer() -> None:
    edges = [ImportEdge("build_site", "learner_site.page", 1)]
    assert layer_violations(edges, LAYERS_LOWEST_FIRST) == []


def test_import_cycle_is_reported_once() -> None:
    edges = [ImportEdge("chemistry.arrows", "chemistry.graph", 1),
             ImportEdge("chemistry.graph", "chemistry.arrows", 1)]
    assert import_cycles(edges) == [
        "cycle: chemistry.arrows -> chemistry.graph -> chemistry.arrows"]


def test_no_cycle_in_a_chain() -> None:
    edges = [ImportEdge("learner_site.page", "chemistry.graph", 1),
             ImportEdge("chemistry.graph", "chemistry.arrows", 1)]
    assert import_cycles(edges) == []


def test_main_reports_a_violation_and_returns_one(
        tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    write_pyproject(tmp_path)
    write_module(tmp_path, "chemistry/arrows.py", "from learner_site import page\n")
    write_module(tmp_path, "learner_site/page.py")
    assert main(tmp_path) == 1
    assert "chemistry must not depend on learner_site" in capsys.readouterr().out


def test_main_returns_zero_for_a_clean_tree_and_for_no_source_root(tmp_path: Path) -> None:
    write_pyproject(tmp_path)
    assert main(tmp_path) == 0
    write_module(tmp_path, "learner_site/page.py", "from chemistry import arrows\n")
    write_module(tmp_path, "chemistry/arrows.py")
    assert main(tmp_path) == 0
