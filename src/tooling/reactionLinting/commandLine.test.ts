/** Tests for commandLine.ts: exit statuses, the text and JSON reports, and rewriting files. */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeEach, expect, it } from "vitest";
import { exampleReactionPaths, exampleReactionPath } from "../../testSupport/fixtureFiles.js";
import { exampleTracksFolder } from "../../testSupport/trackEdits.js";
import { runReactionLinting } from "./commandLine.js";

const SN2_REACTION_PATH = exampleReactionPath("sn2-hydroxide-bromomethane.json");

let folder: string;
let printedLines: string[];

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "reaction-linting-"));
  printedLines = [];
});

function run(argumentTexts: readonly string[]): Promise<number> {
  return runReactionLinting(argumentTexts, (line) => printedLines.push(line));
}

function copiedSn2Reaction(fileName = "sn2.json"): string {
  const reactionPath = join(folder, fileName);
  copyFileSync(SN2_REACTION_PATH, reactionPath);
  return reactionPath;
}

/** Set (or, with undefined, delete) one key of one state of the file. */
function editFile(reactionPath: string, stateId: string, key: string, newValue: unknown): void {
  const document = JSON.parse(readFileSync(reactionPath, "utf-8")) as {
    stateIdToState: Record<string, Record<string, unknown>>;
  };
  const state = document.stateIdToState[stateId] ?? {};
  if (newValue === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- tests name any key
    delete state[key];
  } else {
    state[key] = newValue;
  }
  writeFileSync(reactionPath, JSON.stringify(document), "utf-8");
}

it("clean files exit 0 and print nothing", async () => {
  expect(await run(["lint", ...exampleReactionPaths()])).toBe(0);
  expect(printedLines).toEqual([]);
});

it("an error exits 1 and is printed with the file, rule and place", async () => {
  const reactionPath = copiedSn2Reaction();
  editFile(reactionPath, "reactants", "learnerPrompt", undefined);
  expect(await run(["lint", reactionPath])).toBe(1);
  expect(printedLines).toHaveLength(1);
  expect(printedLines[0]).toMatch(
    `${reactionPath}: error learner-prompt-missing at /stateIdToState/reactants: `,
  );
});

it("a warning alone exits 0", async () => {
  const reactionPath = copiedSn2Reaction();
  editFile(reactionPath, "reactants", "hintTiers", ["One hint."]);
  expect(await run(["lint", reactionPath])).toBe(0);
  expect(printedLines.join("\n")).toContain("warning fewer-than-three-hint-tiers");
});

it("prints the lint reports as JSON with --json", async () => {
  const reactionPath = copiedSn2Reaction();
  editFile(reactionPath, "reactants", "hintTiers", ["One hint."]);
  expect(await run(["lint", "--json", reactionPath])).toBe(0);
  const lintReports: unknown = JSON.parse(printedLines.join("\n"));
  expect(lintReports).toEqual([
    {
      reactionFile: reactionPath,
      errorCount: 0,
      warningCount: 1,
      lintFindings: [
        {
          lintRuleId: "fewer-than-three-hint-tiers",
          lintLevel: "warning",
          instancePath: "/stateIdToState/reactants/hintTiers",
          message: expect.any(String) as unknown,
        },
      ],
    },
  ]);
});

it("a file that is not JSON exits 1", async () => {
  const brokenPath = join(folder, "broken.json");
  writeFileSync(brokenPath, "{ not json", "utf-8");
  expect(await run(["lint", brokenPath])).toBe(1);
  expect(printedLines.join("\n")).toContain(`${brokenPath}: error file-not-readable`);
});

it("seed-coordinates rewrites only a file that changed", async () => {
  const reactionPath = copiedSn2Reaction();
  const untouchedPath = copiedSn2Reaction("untouched.json");
  editFile(reactionPath, "products", "mapNumberToCoordinates", {});
  expect(await run(["seed-coordinates", reactionPath, untouchedPath])).toBe(0);
  expect(printedLines).toContain(`${reactionPath}: seeded products`);
  expect(readFileSync(untouchedPath)).toEqual(readFileSync(SN2_REACTION_PATH));
  expect(await run(["lint", reactionPath])).toBe(0);
});

it.each([
  [[]],
  [["lint"]],
  [["tidy", "x.json"]],
  [["lint", "--loud", "x.json"]],
  [["lint-tracks", "track.json"]],
  [["lint-tracks", "--published-folder", "published"]],
])("a malformed command %j exits 2 with the usage", async (argumentTexts) => {
  expect(await run(argumentTexts)).toBe(2);
  expect(printedLines.join("\n")).toContain("usage:");
});

// lint-tracks
// The four example reactions are the published reactions; their folder holds <slug>.json files,
// the backup folder content/published holds <slug>/<n>.json: both are read by reactionSlug.
const EXAMPLE_TRACK_PATH = join(exampleTracksFolder(), "first-mechanisms.json");
const PUBLISHED_FOLDER = dirname(SN2_REACTION_PATH);

function trackCopy(changedKeys: Record<string, unknown>): string {
  const document = JSON.parse(readFileSync(EXAMPLE_TRACK_PATH, "utf-8")) as Record<string, unknown>;
  mkdirSync(join(folder, "figures"));
  copyFileSync(
    join(exampleTracksFolder(), "figures", "curved-arrow.svg"),
    join(folder, "figures", "curved-arrow.svg"),
  );
  const trackPath = join(folder, "first-mechanisms.json");
  writeFileSync(trackPath, JSON.stringify({ ...document, ...changedKeys }), "utf-8");
  return trackPath;
}

it("lint-tracks: the example track and reactions exit 0 and print nothing", async () => {
  expect(
    await run(["lint-tracks", EXAMPLE_TRACK_PATH, "--published-folder", PUBLISHED_FOLDER]),
  ).toBe(0);
  expect(printedLines).toEqual([]);
});

it("lint-tracks: an unpublished reaction is a printed warning and still exits 0", async () => {
  const emptyPublishedFolder = mkdtempSync(join(tmpdir(), "published-"));
  expect(
    await run(["lint-tracks", EXAMPLE_TRACK_PATH, "--published-folder", emptyPublishedFolder]),
  ).toBe(0);
  expect(printedLines[0]).toBe(
    `${EXAMPLE_TRACK_PATH}: warning set-item-not-published at ` +
      "/problemSets/0/setItems/0/reactionSlug: sn2-hydroxide-bromomethane is not published; " +
      "the catalogue build leaves this set item out",
  );
});

it("lint-tracks: an error exits 1", async () => {
  const trackPath = trackCopy({ goal: "" });
  expect(await run(["lint-tracks", trackPath, "--published-folder", PUBLISHED_FOLDER])).toBe(1);
  expect(printedLines.join("\n")).toContain("error schema-violation at /goal");
});

it("lint-tracks: a missing figure is an error", async () => {
  const trackPath = join(folder, "first-mechanisms.json");
  copyFileSync(EXAMPLE_TRACK_PATH, trackPath);
  expect(await run(["lint-tracks", trackPath, "--published-folder", PUBLISHED_FOLDER])).toBe(1);
  expect(printedLines.join("\n")).toContain("error concept-figure-missing");
});

it("lint-tracks: a file that is not JSON exits 1", async () => {
  const trackPath = join(folder, "broken.json");
  writeFileSync(trackPath, "{ not json", "utf-8");
  expect(await run(["lint-tracks", trackPath, "--published-folder", PUBLISHED_FOLDER])).toBe(1);
  expect(printedLines.join("\n")).toContain("error file-not-readable");
});
