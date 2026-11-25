/** Tests for commandLine.ts: exit statuses, the text and JSON reports, and rewriting files. */
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import { exampleReactionPaths, exampleReactionPath } from "../testSupport/fixtureFiles.js";
import { runReactionLinting } from "./commandLine.js";

// These tests lint whole example reactions (about 2 s alone): allow for a busy parallel run.
vi.setConfig({ testTimeout: 30_000 });

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

it.each([[[]], [["lint"]], [["tidy", "x.json"]], [["lint", "--loud", "x.json"]]])(
  "a malformed command %j exits 2 with the usage",
  async (argumentTexts) => {
    expect(await run(argumentTexts)).toBe(2);
    expect(printedLines.join("\n")).toContain("usage:");
  },
);
