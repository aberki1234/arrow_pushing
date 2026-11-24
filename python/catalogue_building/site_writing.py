"""Write the built static files into an output folder that must be new or empty.

Files written (paths relative to the output folder)
    catalogue.json                          the catalogue, 2-space JSON for people reading it
    r/<slug>/<version>.<hash 8>.json        each published version's canonical JSON bytes
"""
import json
from pathlib import Path
from typing import Any, Mapping, Sequence

from catalogue_building.catalogue_build_errors import CatalogueBuildError
from catalogue_building.published_versions import PublishedVersion
from catalogue_building.static_file_naming import canonical_json_bytes, reaction_file_path

CATALOGUE_FILE_NAME = "catalogue.json"


def check_output_folder_usable(output_folder: Path) -> None:
    """Raises CatalogueBuildError output-folder-not-empty unless the folder is new or empty, so a
    build never mixes its files with an older build's."""
    if output_folder.exists() and (not output_folder.is_dir() or any(output_folder.iterdir())):
        raise CatalogueBuildError("output-folder-not-empty",
                                  f"{output_folder} already exists and is not an empty folder")


def write_site(output_folder: Path, catalogue: Mapping[str, Any],
               published_versions: Sequence[PublishedVersion]) -> None:
    """Write the catalogue and every published version's file."""
    check_output_folder_usable(output_folder)
    for version in published_versions:
        file_path = output_folder / reaction_file_path(
            version.reaction_slug, version.reaction_version, version.content_hash)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(canonical_json_bytes(version.reaction_document))
    catalogue_text = json.dumps(catalogue, ensure_ascii=False, indent=2) + "\n"
    (output_folder / CATALOGUE_FILE_NAME).write_text(catalogue_text, encoding="utf-8")
