"""Extend the daily calendar: a list of (date, reaction version ref) that only grows.

Rules (docs/schema-design.md section 6, decided 2026-11-25)
    * Every date already in the calendar is kept as it is, past or future; dates are only
      appended after the last one (or from the build date for a new calendar), with no gap.
    * Whole cycles are appended until the last date is at least the build date plus
      `days_ahead`. A cycle shows every eligible reaction once. Because each build starts a
      fresh cycle, no cycle boundary needs storing.
    * A cycle's order: eligible slugs sorted by the sha256 hex digest of
      "<cycle start date>:<slug>" (no random-number generator, so no dependence on a Python
      version). If the reaction that ended the calendar would come first, the first two swap,
      so no reaction is played two days running (impossible with one eligible reaction).
    * Appended dates use the version refs given as eligible (the latest version of each slug).
"""
import hashlib
from datetime import date, timedelta
from typing import Dict, List, Mapping, Optional, Sequence

from catalogue_building.catalogue_build_errors import CatalogueBuildError
from catalogue_building.static_file_naming import parse_reaction_version_ref

DAILY_CALENDAR_DAYS_AHEAD = 60
ONE_DAY = timedelta(days=1)


def _cycle_order(cycle_start_date: date, eligible_version_refs: Sequence[str],
                 slug_ending_calendar: Optional[str]) -> List[str]:
    """The eligible refs in this cycle's order (see the module docstring)."""

    def order_key(version_ref: str) -> tuple[str, str]:
        reaction_slug = parse_reaction_version_ref(version_ref)[0]
        seed_text = f"{cycle_start_date.isoformat()}:{reaction_slug}"
        return hashlib.sha256(seed_text.encode("utf-8")).hexdigest(), reaction_slug

    ordered_refs = sorted(eligible_version_refs, key=order_key)
    first_slug = parse_reaction_version_ref(ordered_refs[0])[0]
    if len(ordered_refs) > 1 and first_slug == slug_ending_calendar:
        ordered_refs[0], ordered_refs[1] = ordered_refs[1], ordered_refs[0]
    return ordered_refs


def appended_daily_calendar(previous_date_to_ref: Mapping[str, str],
                            eligible_version_refs: Sequence[str], build_date: date,
                            days_ahead: int = DAILY_CALENDAR_DAYS_AHEAD) -> Dict[str, str]:
    """The previous calendar (date text "YYYY-MM-DD" to reaction version ref) with whole cycles
    appended, in date order. The previous mapping is not changed. Raises CatalogueBuildError
    no-eligible-reactions if dates must be appended but nothing is eligible."""
    date_to_ref = dict(sorted(previous_date_to_ref.items()))
    last_date = (date.fromisoformat(list(date_to_ref)[-1]) if date_to_ref
                 else build_date - ONE_DAY)
    last_date_needed = build_date + timedelta(days=days_ahead)
    if last_date < last_date_needed and not eligible_version_refs:
        raise CatalogueBuildError("no-eligible-reactions",
                                  f"the daily calendar must reach {last_date_needed} but no "
                                  "reaction's latest version is dailyPuzzleEligible")
    while last_date < last_date_needed:
        slug_ending_calendar = (parse_reaction_version_ref(date_to_ref[last_date.isoformat()])[0]
                                if last_date.isoformat() in date_to_ref else None)
        for version_ref in _cycle_order(last_date + ONE_DAY, eligible_version_refs,
                                        slug_ending_calendar):
            last_date += ONE_DAY
            date_to_ref[last_date.isoformat()] = version_ref
    return date_to_ref
