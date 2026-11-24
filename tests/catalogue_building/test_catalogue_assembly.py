"""Tests for catalogue_assembly.py: entries, eligibility, the catalogue schema, the checks against
the previous catalogue, and the assembled catalogue."""
import copy
import json
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest
from catalogue_building.catalogue_assembly import (
    assemble_catalogue,
    catalogue_entries,
    catalogue_schema_violation_paths,
    check_against_previous_catalogue,
    eligible_version_refs,
)
from catalogue_building.catalogue_build_errors import CatalogueBuildError
from catalogue_building.published_versions import PublishedVersion
from catalogue_building.static_file_naming import content_hash_of

READING_CASES_PATH = (Path(__file__).resolve().parents[2]
                      / "fixtures" / "catalogue" / "catalogue_reading_cases.json")
BUILT_AT = "2026-12-01T10:00:00Z"


def stand_in_version(version_ref: str, eligible: bool = True,
                     subtitle: Optional[str] = None) -> PublishedVersion:
    """A published version holding only the keys the catalogue reads."""
    reaction_slug, version_text = version_ref.split("@")
    document: Dict[str, Any] = {
        "reactionSlug": reaction_slug, "reactionVersion": int(version_text),
        "title": f"{reaction_slug} v{version_text}", "reactionClasses": ["substitution"],
        "difficultyTier": 2, "dailyPuzzleEligible": eligible}
    if subtitle is not None:
        document["subtitle"] = subtitle
    return PublishedVersion(reaction_slug, int(version_text), document, content_hash_of(document),
                            Path(f"{version_ref}.json"))


def test_one_entry_per_slug_sorted_and_read_from_the_latest_version() -> None:
    sn2_first, sn2_second = stand_in_version("sn2@1"), stand_in_version("sn2@2", subtitle="OH⁻")
    aldol = stand_in_version("aldol@1")
    entries = catalogue_entries([sn2_second, aldol, sn2_first])
    assert [entry["reactionSlug"] for entry in entries] == ["aldol", "sn2"]
    assert entries[0]["subtitle"] is None
    assert entries[1] == {
        "reactionSlug": "sn2", "latestReactionVersion": 2,
        "reactionVersionToContentHash": {"1": sn2_first.content_hash,
                                         "2": sn2_second.content_hash},
        "title": "sn2 v2", "subtitle": "OH⁻", "reactionClasses": ["substitution"],
        "difficultyTier": 2, "dailyPuzzleEligible": True}


def test_eligibility_is_read_from_the_latest_version_only() -> None:
    published_versions = [stand_in_version("sn2@1"), stand_in_version("sn2@2"),
                          stand_in_version("e2@1"), stand_in_version("e2@2", eligible=False),
                          stand_in_version("aldol@1", eligible=False),
                          stand_in_version("aldol@2")]
    assert eligible_version_refs(published_versions) == ["aldol@2", "sn2@2"]


def reading_cases() -> Dict[str, Any]:
    cases: Dict[str, Any] = json.loads(READING_CASES_PATH.read_text(encoding="utf-8"))
    return cases


def test_the_shared_example_catalogue_is_valid() -> None:
    assert catalogue_schema_violation_paths(reading_cases()["catalogue"]) == []


@pytest.mark.parametrize("edit", reading_cases()["invalidEdits"], ids=lambda edit: edit["caseName"])
def test_shared_invalid_edit_is_reported_at_its_path(edit: Dict[str, Any]) -> None:
    catalogue = copy.deepcopy(reading_cases()["catalogue"])
    parent = catalogue
    for key in edit["pathToSet"][:-1]:
        parent = parent[key]
    parent[edit["pathToSet"][-1]] = edit["newValue"]
    assert edit["expectedViolationPath"] in catalogue_schema_violation_paths(catalogue)


def first_build(published_versions: List[PublishedVersion]) -> Dict[str, Any]:
    return assemble_catalogue(published_versions, None, date(2026, 12, 1), BUILT_AT)


def test_a_first_build_starts_the_calendar_on_the_build_date() -> None:
    published_versions = [stand_in_version("sn2@1"), stand_in_version("aldol@1")]
    catalogue = first_build(published_versions)
    assert catalogue["formatVersion"] == 1
    assert catalogue["builtAt"] == BUILT_AT
    assert catalogue["reactions"] == catalogue_entries(published_versions)
    calendar = catalogue["dateToDailyReactionVersionRef"]
    assert list(calendar)[0] == "2026-12-01"
    assert set(calendar.values()) == {"sn2@1", "aldol@1"}
    assert catalogue_schema_violation_paths(catalogue) == []


def test_a_later_build_keeps_every_date_and_appends() -> None:
    previous = first_build([stand_in_version("sn2@1"), stand_in_version("aldol@1")])
    published_versions = [stand_in_version("sn2@1"), stand_in_version("aldol@1"),
                          stand_in_version("sn2@2"), stand_in_version("e2@1")]
    catalogue = assemble_catalogue(published_versions, previous, date(2026, 12, 20), BUILT_AT)
    calendar = catalogue["dateToDailyReactionVersionRef"]
    previous_calendar = previous["dateToDailyReactionVersionRef"]
    assert {day: calendar[day] for day in previous_calendar} == previous_calendar
    appended_refs = {ref for day, ref in calendar.items() if day not in previous_calendar}
    assert appended_refs == {"sn2@2", "aldol@1", "e2@1"}


def test_an_invalid_previous_catalogue_is_refused() -> None:
    previous = first_build([stand_in_version("sn2@1")])
    previous["formatVersion"] = 2
    with pytest.raises(CatalogueBuildError) as raised:
        assemble_catalogue([stand_in_version("sn2@1")], previous, date(2026, 12, 2), BUILT_AT)
    assert raised.value.error_code == "previous-catalogue-invalid"


def test_a_consistent_previous_catalogue_passes() -> None:
    published_versions = [stand_in_version("sn2@1"), stand_in_version("aldol@1")]
    check_against_previous_catalogue(first_build(published_versions),
                                     published_versions + [stand_in_version("sn2@2")])


def test_a_version_dropped_since_the_previous_build_is_refused() -> None:
    previous = first_build([stand_in_version("sn2@1"), stand_in_version("aldol@1")])
    previous["dateToDailyReactionVersionRef"] = {}
    with pytest.raises(CatalogueBuildError) as raised:
        check_against_previous_catalogue(previous, [stand_in_version("sn2@1")])
    assert raised.value.error_code == "published-version-missing"
    assert "aldol@1" in str(raised.value)


def test_a_changed_published_version_is_refused() -> None:
    previous = first_build([stand_in_version("sn2@1")])
    with pytest.raises(CatalogueBuildError) as raised:
        check_against_previous_catalogue(previous, [stand_in_version("sn2@1", subtitle="new")])
    assert raised.value.error_code == "content-hash-changed"
    assert "sn2@1" in str(raised.value)


def test_a_calendar_ref_to_a_version_not_given_is_refused() -> None:
    previous = first_build([stand_in_version("sn2@1")])
    previous["dateToDailyReactionVersionRef"]["2026-11-30"] = "ghost@1"
    with pytest.raises(CatalogueBuildError) as raised:
        check_against_previous_catalogue(previous, [stand_in_version("sn2@1")])
    assert raised.value.error_code == "calendar-ref-not-published"
    assert "2026-11-30" in str(raised.value)
