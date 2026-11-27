/**
 * Tests for fieldText.ts: list fields edited as lines of text in the editor's panels. Each format
 * reads back what it writes.
 */
import { describe, expect, it } from "vitest";
import {
  abbreviatedGroupsText,
  annotationsText,
  authorsText,
  mapNumbersText,
  readAbbreviatedGroups,
  readAnnotations,
  readAuthors,
  readMapNumbers,
  readRoles,
  rolesText,
} from "./fieldText.js";

describe("map numbers", () => {
  it("reads numbers separated by commas or spaces, and writes them back", () => {
    expect(readMapNumbers("4, 7 9")).toEqual({ value: [4, 7, 9] });
    expect(readMapNumbers("")).toEqual({ value: [] });
    expect(mapNumbersText([4, 7])).toBe("4, 7");
    expect(readMapNumbers("4, x")).toEqual({ reason: '"x" is not a map number' });
  });
});

describe("authors", () => {
  it("reads one author per line, an optional link after |", () => {
    const authors = [
      { name: "A. Chemist", url: "https://example.org" },
      { name: "B. Student", url: null },
    ];
    expect(readAuthors("A. Chemist | https://example.org\n\nB. Student")).toEqual({
      value: authors,
    });
    expect(authorsText(authors)).toBe("A. Chemist | https://example.org\nB. Student");
  });
});

describe("roles", () => {
  it("reads 'role: map numbers' lines", () => {
    expect(readRoles("nucleophile: 1\nleavingGroup: 3, 5")).toEqual({
      value: { nucleophile: [1], leavingGroup: [3, 5] },
    });
    expect(rolesText({ nucleophile: [1] })).toBe("nucleophile: 1");
    expect(readRoles("nucleophile 1")).toEqual({
      reason: 'write "role: map numbers": nucleophile 1',
    });
  });
});

describe("annotations", () => {
  it("reads 'text @ map number' lines", () => {
    const annotations = [{ text: "nucleophile", nearMapNumber: 1 }];
    expect(readAnnotations("nucleophile @ 1")).toEqual({ value: annotations });
    expect(annotationsText(annotations)).toBe("nucleophile @ 1");
    expect(readAnnotations("nucleophile")).toEqual({
      reason: 'write "text @ map number": nucleophile',
    });
  });
});

describe("abbreviated groups", () => {
  it("reads 'label @ attachment: map numbers' lines", () => {
    const groups = [
      { groupLabel: "Ph", attachmentMapNumber: 11, mapNumbers: [11, 12, 13, 14, 15, 16] },
    ];
    expect(readAbbreviatedGroups("Ph @ 11: 11, 12, 13, 14, 15, 16")).toEqual({ value: groups });
    expect(abbreviatedGroupsText(groups)).toBe("Ph @ 11: 11, 12, 13, 14, 15, 16");
    expect(readAbbreviatedGroups("Ph 11")).toEqual({
      reason: 'write "label @ attachment: map numbers": Ph 11',
    });
  });
});
