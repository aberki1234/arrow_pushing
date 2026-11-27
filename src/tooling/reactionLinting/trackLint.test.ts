/**
 * Tests for trackLint.ts and conceptFigureChecks.ts.
 *
 * The example track (fixtures/tracks/first-mechanisms.json) lints clean against the four example
 * reactions. Each case in fixtures/lint_cases/track_edits.json edits it to break a rule and names
 * the rule ids expected, worked out by hand from the rules in docs/schema-design.md §6.1.
 */
import { expect, it } from "vitest";
import type { TrackDocument } from "../../core/trackFiles/trackSchemaViolations.js";
import {
  EXAMPLE_REACTION_SLUGS,
  editedTrack,
  exampleTrack,
  exampleTracksFolder,
  trackEditCases,
} from "../../testSupport/trackEdits.js";
import { newTemporaryFolder } from "../../testSupport/reactionCopies.js";
import { missingConceptFigureFindings } from "./conceptFigureChecks.js";
import { lintTrack } from "./trackLint.js";

it("the example track lints clean", () => {
  expect(lintTrack(exampleTrack(), EXAMPLE_REACTION_SLUGS)).toEqual([]);
});

it.each(trackEditCases().map((editCase) => [editCase.caseName, editCase] as const))(
  "%s",
  (caseName, editCase) => {
    const findings = lintTrack(editedTrack(caseName), EXAMPLE_REACTION_SLUGS);
    const ruleIds = [...new Set(findings.map((finding) => finding.lintRuleId))].sort();
    expect(ruleIds).toEqual(editCase.expectedLintRuleIds);
  },
);

it("an unpublished reaction is only a warning, at its set item", () => {
  const findings = lintTrack(editedTrack("a reaction not published yet"), EXAMPLE_REACTION_SLUGS);
  expect(findings).toEqual([
    expect.objectContaining({
      lintLevel: "warning",
      instancePath: "/problemSets/0/setItems/2/reactionSlug",
    }),
  ]);
  expect(findings[0]?.message).toContain("e2-elimination");
});

it("a repeated reaction is reported at its second appearance", () => {
  const findings = lintTrack(
    editedTrack("a reaction twice in one problem set"),
    EXAMPLE_REACTION_SLUGS,
  );
  expect(findings.map((finding) => [finding.lintLevel, finding.instancePath])).toEqual([
    ["error", "/problemSets/0/setItems/2/reactionSlug"],
  ]);
});

it("a track that is not even an object is one schema violation", () => {
  const findings = lintTrack("not a track", EXAMPLE_REACTION_SLUGS);
  expect(findings.map((finding) => finding.lintRuleId)).toEqual(["schema-violation"]);
});

it("the example track's figure exists beside it", () => {
  const track = exampleTrack() as unknown as TrackDocument;
  expect(missingConceptFigureFindings(track, exampleTracksFolder())).toEqual([]);
});

it("a figure missing from the track's folder is an error at its path", () => {
  const track = exampleTrack() as unknown as TrackDocument;
  const findings = missingConceptFigureFindings(track, newTemporaryFolder("track-figures"));
  expect(findings).toEqual([
    expect.objectContaining({
      lintRuleId: "concept-figure-missing",
      lintLevel: "error",
      instancePath: "/problemSets/0/conceptFigurePaths/0",
    }),
  ]);
});
