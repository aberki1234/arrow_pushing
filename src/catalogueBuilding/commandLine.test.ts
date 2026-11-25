/** Tests for commandLine.ts and siteWriting.ts: whole builds on the example reactions. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, expect, it } from "vitest";
import { exampleReactionPath, exampleReactionPaths } from "../testSupport/fixtureFiles.js";
import {
  copyExampleReaction,
  leaveOneHintTier,
  newTemporaryFolder,
  readJsonFile,
} from "../testSupport/reactionCopies.js";
import { catalogueSchemaViolationPaths } from "./catalogueAssembly.js";
import { runCatalogueBuilding } from "./commandLine.js";
import { canonicalJsonBytes } from "./staticFileNaming.js";

const FIXED_TIMES = ["--build-date", "2026-12-01", "--built-at", "2026-12-01T10:00:00Z"];
const SN2_SLUG = "sn2-hydroxide-bromomethane";

let folder: string;
let printedLines: string[];

beforeEach(() => {
  folder = newTemporaryFolder("catalogue-building");
  printedLines = [];
});

function run(argumentTexts: readonly string[]): Promise<number> {
  return runCatalogueBuilding(argumentTexts, (line) => printedLines.push(line));
}

function build(
  inputPaths: readonly string[],
  outputFolder: string,
  ...options: string[]
): Promise<number> {
  return run(["build", ...inputPaths, "--out", outputFolder, ...options]);
}

/** Every file under `root`, as paths relative to it, sorted. */
function filesUnder(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)))
    .sort();
}

async function firstSite(): Promise<string> {
  const outputFolder = join(folder, "first_site");
  expect(
    await build(exampleReactionPaths(), outputFolder, "--start-new-calendar", ...FIXED_TIMES),
  ).toBe(0);
  return outputFolder;
}

function calendarOf(catalogue: Record<string, unknown>): Record<string, unknown> {
  const calendar = catalogue.dateToDailyReactionVersionRef;
  return typeof calendar === "object" && calendar !== null ? { ...calendar } : {};
}

it("a new build writes the catalogue and one hashed file per version", async () => {
  const outputFolder = await firstSite();
  expect(printedLines).toEqual([]);
  const catalogue = readJsonFile(join(outputFolder, "catalogue.json"));
  expect(catalogueSchemaViolationPaths(catalogue)).toEqual([]);
  expect(catalogue.builtAt).toBe("2026-12-01T10:00:00Z");
  expect(Object.keys(calendarOf(catalogue))[0]).toBe("2026-12-01");
  const entries = catalogue.reactions as {
    reactionSlug: string;
    reactionVersionToContentHash: Record<string, string>;
  }[];
  const expectedPaths = entries.map((entry) => {
    const contentHash = entry.reactionVersionToContentHash["1"] ?? "";
    const filePath = join("r", entry.reactionSlug, `1.${contentHash.slice(0, 8)}.json`);
    const fileBytes = readFileSync(join(outputFolder, filePath));
    expect(createHash("sha256").update(fileBytes).digest("hex")).toBe(contentHash);
    const source = readJsonFile(exampleReactionPath(`${entry.reactionSlug}.json`));
    expect(new Uint8Array(fileBytes)).toEqual(canonicalJsonBytes(source));
    return filePath;
  });
  expect(filesUnder(join(outputFolder, "r")).map((path) => join("r", path))).toEqual(
    expectedPaths.sort(),
  );
  expect(expectedPaths).toHaveLength(exampleReactionPaths().length);
});

it("a later build keeps the calendar and adds a new version", async () => {
  const previousCataloguePath = join(await firstSite(), "catalogue.json");
  const secondVersion = copyExampleReaction(folder, SN2_SLUG, {
    reactionVersion: 2,
    previousReactionVersion: 1,
    title: "SN2 (revised)",
  });
  const outputFolder = join(folder, "second_site");
  const exitStatus = await build(
    [...exampleReactionPaths(), secondVersion],
    outputFolder,
    "--previous-catalogue",
    previousCataloguePath,
    "--build-date",
    "2026-12-20",
    "--built-at",
    "2026-12-20T09:00:00Z",
  );
  expect(exitStatus).toBe(0);
  const previousCalendar = calendarOf(readJsonFile(previousCataloguePath));
  const catalogue = readJsonFile(join(outputFolder, "catalogue.json"));
  const calendar = calendarOf(catalogue);
  for (const [day, ref] of Object.entries(previousCalendar)) {
    expect(calendar[day]).toBe(ref);
  }
  expect(Object.values(calendar)).toContain(`${SN2_SLUG}@2`);
  const entries = catalogue.reactions as {
    reactionSlug: string;
    latestReactionVersion: number;
    title: string;
  }[];
  const sn2Entry = entries.find((entry) => entry.reactionSlug === SN2_SLUG);
  expect(sn2Entry?.latestReactionVersion).toBe(2);
  expect(sn2Entry?.title).toBe("SN2 (revised)");
  expect(readdirSync(join(outputFolder, "r", SN2_SLUG))).toHaveLength(2);
});

/** Run a build that must refuse; returns the last printed line. Nothing may be written. */
async function refusedBuild(
  outputFolder: string,
  argumentTexts: readonly string[],
): Promise<string> {
  const filesBefore = filesUnder(outputFolder);
  expect(await run(argumentTexts)).toBe(1);
  expect(filesUnder(outputFolder)).toEqual(filesBefore);
  return printedLines[printedLines.length - 1] ?? "";
}

it("a lint error refuses the whole build", async () => {
  const brokenPath = copyExampleReaction(folder, "aldol-addition-base", { difficultyTier: 9 });
  const outputFolder = join(folder, "site");
  const [firstExample = ""] = exampleReactionPaths();
  const printed = await refusedBuild(outputFolder, [
    "build",
    firstExample,
    brokenPath,
    "--out",
    outputFolder,
    "--start-new-calendar",
    ...FIXED_TIMES,
  ]);
  expect(printed).toMatch(/^error reaction-file-has-lint-errors: /);
});

it("a non-empty output folder is refused", async () => {
  const outputFolder = join(folder, "site");
  mkdirSync(outputFolder);
  writeFileSync(join(outputFolder, "old.txt"), "keep me", "utf-8");
  const printed = await refusedBuild(outputFolder, [
    "build",
    ...exampleReactionPaths(),
    "--out",
    outputFolder,
    "--start-new-calendar",
    ...FIXED_TIMES,
  ]);
  expect(printed).toMatch(/^error output-folder-not-empty: /);
});

it("an empty existing output folder is used", async () => {
  const outputFolder = join(folder, "site");
  mkdirSync(outputFolder);
  expect(
    await build(exampleReactionPaths(), outputFolder, "--start-new-calendar", ...FIXED_TIMES),
  ).toBe(0);
  expect(existsSync(join(outputFolder, "catalogue.json"))).toBe(true);
});

it("a missing previous catalogue is refused", async () => {
  const outputFolder = join(folder, "site");
  const printed = await refusedBuild(outputFolder, [
    "build",
    ...exampleReactionPaths(),
    "--out",
    outputFolder,
    "--previous-catalogue",
    join(folder, "nowhere.json"),
  ]);
  expect(printed).toMatch(/^error previous-catalogue-not-readable: /);
});

it("a dropped version is refused", async () => {
  const previousCataloguePath = join(await firstSite(), "catalogue.json");
  const outputFolder = join(folder, "site");
  const printed = await refusedBuild(outputFolder, [
    "build",
    ...exampleReactionPaths().slice(1),
    "--out",
    outputFolder,
    "--previous-catalogue",
    previousCataloguePath,
  ]);
  expect(printed).toMatch(/^error published-version-missing: /);
});

it.each([
  [[]],
  [["--start-new-calendar", "--previous-catalogue", "catalogue.json"]],
  [["--start-new-calendar", "--build-date", "1 December"]],
  [["--start-new-calendar", "--built-at", "2026-12-01 10:00"]],
])("a malformed command (%j) exits 2 with the usage", async (options) => {
  expect(await build(exampleReactionPaths(), join(folder, "site"), ...options)).toBe(2);
  expect(printedLines.join("\n")).toContain("usage:");
});

it("lint warnings are printed and do not block", async () => {
  const warnedPath = copyExampleReaction(folder, SN2_SLUG);
  leaveOneHintTier(warnedPath);
  expect(
    await build([warnedPath], join(folder, "site"), "--start-new-calendar", ...FIXED_TIMES),
  ).toBe(0);
  expect(printedLines.join("\n")).toContain(
    `${warnedPath}: warning fewer-than-three-hint-tiers at /stateIdToState/reactants`,
  );
});

it("the build date and time default to now in UTC", async () => {
  const outputFolder = join(folder, "site");
  expect(
    await build(exampleReactionPaths().slice(0, 1), outputFolder, "--start-new-calendar"),
  ).toBe(0);
  const catalogue = readJsonFile(join(outputFolder, "catalogue.json"));
  expect(catalogue.builtAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  expect(Object.keys(calendarOf(catalogue))[0]).toBe(new Date().toISOString().slice(0, 10));
});
