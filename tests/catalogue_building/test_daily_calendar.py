"""Tests for daily_calendar.py against the shared cases in
fixtures/catalogue/daily_calendar_cases.json (expected calendars worked out by hand with
sha256sum)."""
import json
from datetime import date
from pathlib import Path
from typing import Any, Dict, List

import pytest
from catalogue_building.catalogue_build_errors import CatalogueBuildError
from catalogue_building.daily_calendar import DAILY_CALENDAR_DAYS_AHEAD, appended_daily_calendar

CASES_PATH = (Path(__file__).resolve().parents[2]
              / "fixtures" / "catalogue" / "daily_calendar_cases.json")


def calendar_cases() -> List[Dict[str, Any]]:
    cases: List[Dict[str, Any]] = json.loads(CASES_PATH.read_text(encoding="utf-8"))["cases"]
    return cases


@pytest.mark.parametrize("case", calendar_cases(), ids=lambda case: case["caseName"])
def test_shared_calendar_case(case: Dict[str, Any]) -> None:
    arguments = (case["previousDateToDailyReactionVersionRef"],
                 case["eligibleReactionVersionRefs"], date.fromisoformat(case["buildDate"]),
                 case["daysAhead"])
    if "expectedErrorCode" in case:
        with pytest.raises(CatalogueBuildError) as raised:
            appended_daily_calendar(*arguments)
        assert raised.value.error_code == case["expectedErrorCode"]
        return
    calendar = appended_daily_calendar(*arguments)
    assert calendar == case["expectedDateToDailyReactionVersionRef"]
    assert list(calendar) == sorted(calendar), "dates must come out in order"


def test_the_default_fills_sixty_days_ahead_in_whole_cycles() -> None:
    eligible_refs = ["aldol@1", "sn2@1", "wittig@1", "e2@1"]
    calendar = appended_daily_calendar({}, eligible_refs, date(2026, 12, 1))
    assert DAILY_CALENDAR_DAYS_AHEAD == 60
    assert list(calendar)[0] == "2026-12-01"
    assert len(calendar) % len(eligible_refs) == 0
    assert 61 <= len(calendar) < 61 + len(eligible_refs)


def test_no_reaction_is_played_two_days_running() -> None:
    eligible_refs = ["aldol@1", "sn2@1", "wittig@1"]
    calendar = appended_daily_calendar({}, eligible_refs, date(2026, 12, 1))
    refs_in_date_order = list(calendar.values())
    for earlier_ref, later_ref in zip(refs_in_date_order, refs_in_date_order[1:], strict=False):
        assert earlier_ref != later_ref


def test_the_previous_calendar_is_not_changed_in_place() -> None:
    previous = {"2026-12-01": "sn2@1"}
    appended_daily_calendar(previous, ["aldol@1"], date(2026, 12, 1), 3)
    assert previous == {"2026-12-01": "sn2@1"}
