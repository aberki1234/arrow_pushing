/**
 * Tests for dailyCalendar.ts against the shared cases in
 * fixtures/catalogue/daily_calendar_cases.json (expected calendars worked out by hand with
 * sha256sum).
 */
import { expect, it } from "vitest";
import {
  fixtureCaseEntries,
  isRecord,
  textField,
  textListField,
} from "../testSupport/fixtureFiles.js";
import { CatalogueBuildError } from "./catalogueBuildErrors.js";
import { appendedDailyCalendar, DAILY_CALENDAR_DAYS_AHEAD } from "./dailyCalendar.js";

function textRecord(value: unknown): Record<string, string> {
  if (!isRecord(value) || !Object.values(value).every((item) => typeof item === "string")) {
    throw new Error("expected an object of text");
  }
  return value as Record<string, string>;
}

const calendarCases = fixtureCaseEntries("catalogue/daily_calendar_cases.json", "cases").map(
  (entry) => [textField(entry, "caseName"), entry] as const,
);

it.each(calendarCases)("%s", (caseName, entry) => {
  const calculate = (): Record<string, string> =>
    appendedDailyCalendar(
      textRecord(entry.previousDateToDailyReactionVersionRef),
      textListField(entry, "eligibleReactionVersionRefs"),
      textField(entry, "buildDate"),
      Number(entry.daysAhead),
    );
  if ("expectedErrorCode" in entry) {
    expect(calculate).toThrow(CatalogueBuildError);
    try {
      calculate();
    } catch (error) {
      expect(error instanceof CatalogueBuildError && error.errorCode).toBe(entry.expectedErrorCode);
    }
    return;
  }
  const calendar = calculate();
  expect(calendar).toEqual(textRecord(entry.expectedDateToDailyReactionVersionRef));
  expect(Object.keys(calendar)).toEqual(Object.keys(calendar).sort());
});

it("the default fills sixty days ahead in whole cycles", () => {
  const eligibleRefs = ["aldol@1", "sn2@1", "wittig@1", "e2@1"];
  const calendar = appendedDailyCalendar({}, eligibleRefs, "2026-12-01");
  const dates = Object.keys(calendar);
  expect(DAILY_CALENDAR_DAYS_AHEAD).toBe(60);
  expect(dates[0]).toBe("2026-12-01");
  expect(dates.length % eligibleRefs.length).toBe(0);
  expect(dates.length).toBeGreaterThanOrEqual(61);
  expect(dates.length).toBeLessThan(61 + eligibleRefs.length);
});

it("no reaction is played two days running", () => {
  const refsInDateOrder = Object.values(
    appendedDailyCalendar({}, ["aldol@1", "sn2@1", "wittig@1"], "2026-12-01"),
  );
  refsInDateOrder.slice(1).forEach((laterRef, index) => {
    expect(laterRef).not.toBe(refsInDateOrder[index]);
  });
});

it("the previous calendar is not changed in place", () => {
  const previous = { "2026-12-01": "sn2@1" };
  appendedDailyCalendar(previous, ["aldol@1"], "2026-12-01", 3);
  expect(previous).toEqual({ "2026-12-01": "sn2@1" });
});

it("dates step across months and years in UTC", () => {
  const calendar = appendedDailyCalendar({ "2026-12-30": "sn2@1" }, ["aldol@1"], "2026-12-30", 3);
  expect(Object.keys(calendar)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
});
