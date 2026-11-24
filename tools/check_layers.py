"""Fail if a Python package imports a package at its own layer or above, or if imports form a cycle.

Terms
    source root          The folder that holds the packages ([tool.layers] source_root).
    layer                A top-level package of the source root. [tool.layers] layers_lowest_first
                         lists them lowest first; a package may import only packages listed
                         before it.
    entry-point script   A module directly in the source root (no package). Nothing may import one.
    import edge          One import statement: which module imports which, and on which line.
                         Imports inside functions count: a lazy import is still a dependency.

Steps
    1. load_layer_config() reads the source root and the layer order.
    2. discover_modules() finds the modules inside declared layers, plus the entry-point scripts.
    3. import_edges() lists the imports between those modules.
    4. layer_violations() and import_cycles() turn the edges into problem lines.
    5. main() prints every problem and returns 1 if there was any, else 0.
"""
import ast
import sys
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterator, List, Set, Tuple

PROJECT_ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class LayerConfig:
    """Where the packages are, and their layer order (lowest first)."""
    source_root: Path
    layers_lowest_first: List[str]


@dataclass(frozen=True)
class ImportEdge:
    """`importing_module` imports `imported_module` on `line_number`. Module names are dotted and
    relative to the source root, e.g. "notation.arrow_parser"."""
    importing_module: str
    imported_module: str
    line_number: int


def load_layer_config(project_root: Path) -> LayerConfig:
    """Read [tool.layers] from `project_root`/pyproject.toml. source_root becomes an absolute
    path."""
    with open(project_root / "pyproject.toml", "rb") as pyproject_file:
        layer_table = tomllib.load(pyproject_file)["tool"]["layers"]
    return LayerConfig(source_root=project_root / layer_table["source_root"],
                       layers_lowest_first=list(layer_table["layers_lowest_first"]))


def _dotted_module_name(source_root: Path, file_path: Path) -> str:
    """"chemistry/arrows.py" under the source root -> "chemistry.arrows"."""
    return ".".join(file_path.relative_to(source_root).with_suffix("").parts)


def discover_modules(config: LayerConfig) -> Dict[str, Path]:
    """Map each dotted module name to its file: modules inside a declared layer, plus entry-point
    scripts. __init__.py files are left out. A missing source root gives an empty mapping."""
    module_name_to_path: Dict[str, Path] = {}
    if not config.source_root.is_dir():
        return module_name_to_path
    for file_path in sorted(config.source_root.rglob("*.py")):
        module_name = _dotted_module_name(config.source_root, file_path)
        if module_name.endswith("__init__"):
            continue
        is_entry_point_script = "." not in module_name
        is_in_declared_layer = module_name.split(".")[0] in config.layers_lowest_first
        if is_entry_point_script or is_in_declared_layer:
            module_name_to_path[module_name] = file_path
    return module_name_to_path


def _imported_names(file_path: Path) -> Iterator[Tuple[str, int]]:
    """Every dotted name an import statement in the file refers to, with its line number."""
    for node in ast.walk(ast.parse(file_path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.ImportFrom) and node.module:
            yield node.module, node.lineno
            for imported_alias in node.names:
                yield f"{node.module}.{imported_alias.name}", node.lineno
        elif isinstance(node, ast.Import):
            for imported_alias in node.names:
                yield imported_alias.name, node.lineno


def import_edges(module_name_to_path: Dict[str, Path]) -> List[ImportEdge]:
    """Every import from one discovered module to another (not to itself), in file order.
    `from package import name` counts as importing both `package` and `package.name`."""
    edges = []
    for importing_module, file_path in module_name_to_path.items():
        edges_of_this_module = [
            ImportEdge(importing_module, imported_name, line_number)
            for imported_name, line_number in _imported_names(file_path)
            if imported_name in module_name_to_path and imported_name != importing_module]
        edges += sorted(edges_of_this_module, key=lambda edge: edge.line_number)
    return edges


def layer_violations(edges: List[ImportEdge], layers_lowest_first: List[str]) -> List[str]:
    """One problem line per forbidden edge: a package importing another package at its own layer or
    above, or any module importing an entry-point script. Imports within one package are allowed."""
    layer_to_height = {layer: height for height, layer in enumerate(layers_lowest_first)}
    problems = []
    for edge in edges:
        importing_package = edge.importing_module.split(".")[0]
        imported_package = edge.imported_module.split(".")[0]
        location = f"{edge.importing_module}:{edge.line_number} imports {edge.imported_module}"
        if "." not in edge.imported_module:
            problems.append(f"{location.replace(' imports ', ' imports entry-point script ')}")
        elif (importing_package in layer_to_height and importing_package != imported_package
              and layer_to_height[imported_package] >= layer_to_height[importing_package]):
            problems.append(
                f"{location} ({importing_package} must not depend on {imported_package})")
    return problems


def import_cycles(edges: List[ImportEdge]) -> List[str]:
    """One line per import cycle found, as "cycle: a -> b -> a"."""
    module_to_imported_modules: Dict[str, Set[str]] = {}
    for edge in edges:
        imported_modules = module_to_imported_modules.setdefault(edge.importing_module, set())
        imported_modules.add(edge.imported_module)
    # Depth-first search. A module is "on the current path" while its imports are being visited;
    # reaching such a module again closes a cycle.
    modules_on_current_path: List[str] = []
    finished_modules: Set[str] = set()
    cycles: List[str] = []

    def visit(module: str) -> None:
        modules_on_current_path.append(module)
        for imported_module in sorted(module_to_imported_modules.get(module, ())):
            if imported_module in modules_on_current_path:
                cycle_start = modules_on_current_path.index(imported_module)
                cycle = modules_on_current_path[cycle_start:] + [imported_module]
                cycles.append("cycle: " + " -> ".join(cycle))
            elif imported_module not in finished_modules:
                visit(imported_module)
        modules_on_current_path.pop()
        finished_modules.add(module)

    for start_module in sorted(module_to_imported_modules):
        if start_module not in finished_modules:
            visit(start_module)
    return cycles


def main(project_root: Path = PROJECT_ROOT) -> int:
    """Print every layer violation and cycle; return 1 if there was any, else 0."""
    config = load_layer_config(project_root)
    edges = import_edges(discover_modules(config))
    problems = layer_violations(edges, config.layers_lowest_first) + import_cycles(edges)
    if problems:
        print("\n".join(problems))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
