"""Assemble catalogue.json from the published versions and the previous catalogue.

Steps
    1. check_against_previous_catalogue(): every version the previous catalogue lists is still
       given, with the same content hash, and every calendar ref names a given version.
    2. catalogue_entries(): one entry per slug, sorted by slug, read from its latest version.
    3. eligible_version_refs(): the latest version of each slug whose latest version is
       dailyPuzzleEligible.
    4. assemble_catalogue(): all of the above plus the extended daily calendar (daily_calendar).
"""
import json
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence

from jsonschema import Draft202012Validator
from reaction_files.schema_violations import json_pointer

from catalogue_building.catalogue_build_errors import CatalogueBuildError
from catalogue_building.daily_calendar import appended_daily_calendar
from catalogue_building.published_versions import PublishedVersion
from catalogue_building.static_file_naming import reaction_version_ref

CATALOGUE_SCHEMA_PATH = (Path(__file__).resolve().parents[2]
                         / "schema" / "catalogue.schema.json")
CATALOGUE_FORMAT_VERSION = 1


def catalogue_schema_violation_paths(catalogue: Mapping[str, Any]) -> List[str]:
    """The JSON pointer of every place the catalogue breaks schema/catalogue.schema.json, sorted
    and without repeats; empty if it is valid."""
    catalogue_schema = json.loads(CATALOGUE_SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft202012Validator(catalogue_schema)
    return sorted({json_pointer(error.absolute_path)
                   for error in validator.iter_errors(catalogue)})


def _ref_to_content_hash(published_versions: Sequence[PublishedVersion]) -> Dict[str, str]:
    return {reaction_version_ref(version.reaction_slug, version.reaction_version):
            version.content_hash for version in published_versions}


def check_against_previous_catalogue(previous_catalogue: Mapping[str, Any],
                                     published_versions: Sequence[PublishedVersion]) -> None:
    """Raises CatalogueBuildError published-version-missing, content-hash-changed or
    calendar-ref-not-published. The previous catalogue must already be schema-valid."""
    given_ref_to_hash = _ref_to_content_hash(published_versions)
    for entry in previous_catalogue["reactions"]:
        for version_text, previous_hash in entry["reactionVersionToContentHash"].items():
            version_ref = reaction_version_ref(entry["reactionSlug"], int(version_text))
            if version_ref not in given_ref_to_hash:
                raise CatalogueBuildError(
                    "published-version-missing",
                    f"{version_ref} was published in the previous catalogue but is not given")
            if given_ref_to_hash[version_ref] != previous_hash:
                raise CatalogueBuildError(
                    "content-hash-changed",
                    f"{version_ref} differs from the published version (content hash "
                    f"{previous_hash[:8]}… now {given_ref_to_hash[version_ref][:8]}…); "
                    "a published version never changes: publish a new version instead")
    for date_text, version_ref in previous_catalogue["dateToDailyReactionVersionRef"].items():
        if version_ref not in given_ref_to_hash:
            raise CatalogueBuildError(
                "calendar-ref-not-published",
                f"the daily calendar plays {version_ref} on {date_text}, which is not given")


def _latest_versions(published_versions: Sequence[PublishedVersion]) -> List[PublishedVersion]:
    """The latest version of each slug, sorted by slug."""
    slug_to_latest: Dict[str, PublishedVersion] = {}
    for version in published_versions:
        latest = slug_to_latest.get(version.reaction_slug)
        if latest is None or version.reaction_version > latest.reaction_version:
            slug_to_latest[version.reaction_slug] = version
    return [slug_to_latest[reaction_slug] for reaction_slug in sorted(slug_to_latest)]


def catalogue_entries(published_versions: Sequence[PublishedVersion]) -> List[Dict[str, Any]]:
    """One entry per slug, sorted by slug; its texts and facets come from the latest version."""
    entries = []
    for latest in _latest_versions(published_versions):
        version_to_hash = {str(version.reaction_version): version.content_hash
                           for version in sorted(published_versions,
                                                 key=lambda version: version.reaction_version)
                           if version.reaction_slug == latest.reaction_slug}
        document = latest.reaction_document
        entries.append({
            "reactionSlug": latest.reaction_slug,
            "latestReactionVersion": latest.reaction_version,
            "reactionVersionToContentHash": version_to_hash,
            "title": document["title"], "subtitle": document.get("subtitle"),
            "reactionClasses": document["reactionClasses"],
            "difficultyTier": document["difficultyTier"],
            "dailyPuzzleEligible": document["dailyPuzzleEligible"]})
    return entries


def eligible_version_refs(published_versions: Sequence[PublishedVersion]) -> List[str]:
    """The latest version ref of each slug whose latest version is dailyPuzzleEligible, sorted."""
    return [reaction_version_ref(latest.reaction_slug, latest.reaction_version)
            for latest in _latest_versions(published_versions)
            if latest.reaction_document["dailyPuzzleEligible"]]


def assemble_catalogue(published_versions: Sequence[PublishedVersion],
                       previous_catalogue: Optional[Mapping[str, Any]], build_date: date,
                       built_at: str) -> Dict[str, Any]:
    """The new catalogue. `previous_catalogue` None starts a new calendar on `build_date`.
    Raises CatalogueBuildError (previous-catalogue-invalid, the checks above, or
    no-eligible-reactions)."""
    previous_date_to_ref: Mapping[str, str] = {}
    if previous_catalogue is not None:
        violation_paths = catalogue_schema_violation_paths(previous_catalogue)
        if violation_paths:
            raise CatalogueBuildError(
                "previous-catalogue-invalid",
                "the previous catalogue breaks schema/catalogue.schema.json at "
                + ", ".join(path or "/" for path in violation_paths))
        check_against_previous_catalogue(previous_catalogue, published_versions)
        previous_date_to_ref = previous_catalogue["dateToDailyReactionVersionRef"]
    return {"formatVersion": CATALOGUE_FORMAT_VERSION, "builtAt": built_at,
            "reactions": catalogue_entries(published_versions),
            "dateToDailyReactionVersionRef": appended_daily_calendar(
                previous_date_to_ref, eligible_version_refs(published_versions), build_date)}
