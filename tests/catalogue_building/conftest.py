"""Shared helpers for the catalogue build tests: copies of the example reactions, edited."""
import json
from pathlib import Path
from typing import Any, Callable, Dict, Optional

import pytest

REACTIONS_FOLDER = Path(__file__).resolve().parents[2] / "fixtures" / "reactions"

ReactionCopier = Callable[..., Path]  # what the copy_reaction fixture returns


def read_json(json_path: Path) -> Dict[str, Any]:
    document: Dict[str, Any] = json.loads(json_path.read_text(encoding="utf-8"))
    return document


@pytest.fixture
def copy_reaction(tmp_path: Path) -> ReactionCopier:
    """copy_reaction("sn2-hydroxide-bromomethane", reactionVersion=2, ...) writes a copy of that
    example reaction into the test's folder with the given top-level keys replaced, and returns
    its path. The file name is <slug>@<version>.json of the result."""

    def copier(example_slug: str, file_name: Optional[str] = None,
               **replaced_keys: Any) -> Path:
        document = read_json(REACTIONS_FOLDER / f"{example_slug}.json")
        document.update(replaced_keys)
        name = file_name or f'{document["reactionSlug"]}@{document["reactionVersion"]}.json'
        inputs_folder = tmp_path / "inputs"
        inputs_folder.mkdir(exist_ok=True)
        copy_path = inputs_folder / name
        copy_path.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")
        return copy_path

    return copier
