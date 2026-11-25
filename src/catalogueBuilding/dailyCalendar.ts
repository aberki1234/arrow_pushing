/**
 * Extend the daily calendar: a list of (date, reaction version ref) that only grows.
 *
 * Rules (docs/schema-design.md §6, decided 2026-11-25)
 *   * Every date already in the calendar is kept as it is, past or future; dates are only appended
 *     after the last one (or from the build date for a new calendar), with no gap.
 *   * Whole cycles are appended until the last date is at least the build date plus `daysAhead`.
 *     A cycle shows every eligible reaction once. Because each build starts a fresh cycle, no
 *     cycle boundary needs storing.
 *   * A cycle's order: eligible slugs sorted by the sha256 hex digest of
 *     "<cycle start date>:<slug>" (no random-number generator). If the reaction that ended the
 *     calendar would come first, the first two swap, so no reaction is played two days running
 *     (impossible with one eligible reaction).
 *   * Appended dates use the version refs given as eligible (the latest version of each slug).
 * Dates are "YYYY-MM-DD" text, stepped in UTC so no time zone or daylight saving shifts them.
 */
import { createHash } from "node:crypto";
import { CatalogueBuildError } from "./catalogueBuildErrors.js";
import { parseReactionVersionRef } from "./staticFileNaming.js";

export const DAILY_CALENDAR_DAYS_AHEAD = 60;
const MILLISECONDS_PER_DAY = 86_400_000;

/** "2026-12-31" plus 1 day is "2027-01-01". */
function addDays(dateText: string, days: number): string {
  const moment = Date.parse(`${dateText}T00:00:00Z`) + days * MILLISECONDS_PER_DAY;
  return new Date(moment).toISOString().slice(0, 10);
}

function compareText(first: string, second: string): number {
  if (first === second) {
    return 0;
  }
  return first < second ? -1 : 1;
}

/** The eligible refs in this cycle's order (see the module comment). */
function cycleOrder(
  cycleStartDate: string,
  eligibleVersionRefs: readonly string[],
  slugEndingCalendar: string | undefined,
): string[] {
  const slugOf = (versionRef: string): string => parseReactionVersionRef(versionRef)[0];
  const orderKey = (versionRef: string): string =>
    createHash("sha256")
      .update(`${cycleStartDate}:${slugOf(versionRef)}`)
      .digest("hex");
  const orderedRefs = [...eligibleVersionRefs].sort(
    (first, second) =>
      compareText(orderKey(first), orderKey(second)) || compareText(slugOf(first), slugOf(second)),
  );
  const [firstRef, secondRef] = orderedRefs;
  if (
    firstRef !== undefined &&
    secondRef !== undefined &&
    slugOf(firstRef) === slugEndingCalendar
  ) {
    orderedRefs[0] = secondRef;
    orderedRefs[1] = firstRef;
  }
  return orderedRefs;
}

/**
 * The previous calendar (date text to reaction version ref) with whole cycles appended, in date
 * order. The previous calendar is not changed. Throws CatalogueBuildError no-eligible-reactions if
 * dates must be appended but nothing is eligible.
 */
export function appendedDailyCalendar(
  previousDateToRef: Readonly<Record<string, string>>,
  eligibleVersionRefs: readonly string[],
  buildDate: string,
  daysAhead: number = DAILY_CALENDAR_DAYS_AHEAD,
): Record<string, string> {
  const dateToRef = new Map(
    Object.entries(previousDateToRef).sort(([first], [second]) => compareText(first, second)),
  );
  let lastDate = [...dateToRef.keys()].at(-1) ?? addDays(buildDate, -1);
  const lastDateNeeded = addDays(buildDate, daysAhead);
  if (lastDate < lastDateNeeded && eligibleVersionRefs.length === 0) {
    throw new CatalogueBuildError(
      "no-eligible-reactions",
      `the daily calendar must reach ${lastDateNeeded} but no reaction's latest version is ` +
        "dailyPuzzleEligible",
    );
  }
  while (lastDate < lastDateNeeded) {
    const refEndingCalendar = dateToRef.get(lastDate);
    const slugEndingCalendar =
      refEndingCalendar === undefined ? undefined : parseReactionVersionRef(refEndingCalendar)[0];
    for (const versionRef of cycleOrder(
      addDays(lastDate, 1),
      eligibleVersionRefs,
      slugEndingCalendar,
    )) {
      lastDate = addDays(lastDate, 1);
      dateToRef.set(lastDate, versionRef);
    }
  }
  return Object.fromEntries(dateToRef);
}
