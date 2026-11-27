/**
 * Tests for trackSchemaViolations.ts. The example track (fixtures/tracks/first-mechanisms.json) is
 * valid; each edit below breaks one rule of schema/track.schema.json, and the expected instance
 * path is the value the rule is written on.
 */
import { expect, it } from "vitest";
import { exampleTrack } from "../../testSupport/trackEdits.js";
import { applyReactionEdits } from "../../testSupport/reactionEdits.js";
import { trackSchemaViolations } from "./trackSchemaViolations.js";

it("the example track is valid", () => {
  expect(trackSchemaViolations(exampleTrack())).toEqual([]);
});

it.each([
  {
    caseName: "an unknown format version",
    edit: { pathToSet: ["formatVersion"], newValue: 2 },
    expectedPath: "/formatVersion",
  },
  {
    caseName: "a track slug in capitals",
    edit: { pathToSet: ["trackSlug"], newValue: "First" },
    expectedPath: "/trackSlug",
  },
  {
    caseName: "no problem sets",
    edit: { pathToSet: ["problemSets"], newValue: [] },
    expectedPath: "/problemSets",
  },
  {
    caseName: "a problem set without its checkpoint flag",
    edit: { pathToDelete: ["problemSets", 0, "checkpoint"] },
    expectedPath: "/problemSets/0",
  },
  {
    caseName: "a problem set with no set items",
    edit: { pathToSet: ["problemSets", 1, "setItems"], newValue: [] },
    expectedPath: "/problemSets/1/setItems",
  },
  {
    caseName: "a figure outside figures/",
    edit: { pathToSet: ["problemSets", 0, "conceptFigurePaths", 0], newValue: "../escape.svg" },
    expectedPath: "/problemSets/0/conceptFigurePaths/0",
  },
  {
    caseName: "an empty why-this-one note",
    edit: { pathToSet: ["problemSets", 0, "setItems", 0, "whyThisOne"], newValue: "" },
    expectedPath: "/problemSets/0/setItems/0/whyThisOne",
  },
  {
    caseName: "an unknown key on a set item",
    edit: { pathToSet: ["problemSets", 0, "setItems", 0, "reactionVersion"], newValue: 2 },
    expectedPath: "/problemSets/0/setItems/0",
  },
])("$caseName is a violation", ({ edit, expectedPath }) => {
  const edited = applyReactionEdits(exampleTrack(), [edit]);
  const violationPaths = trackSchemaViolations(edited).map((violation) => violation.instancePath);
  expect(violationPaths).toContain(expectedPath);
});
