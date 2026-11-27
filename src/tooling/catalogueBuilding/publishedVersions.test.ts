/** Tests for publishedVersions.ts: reading, the lint gate and version numbering. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type ChemistryToolkit,
  loadChemistryToolkit,
} from "../chemistryToolkit/chemistryToolkit.js";
import { exampleReactionPath } from "../../testSupport/fixtureFiles.js";
import {
  copyExampleReaction,
  leaveOneHintTier,
  newTemporaryFolder,
  readJsonFile,
} from "../../testSupport/reactionCopies.js";
import { CatalogueBuildError } from "./catalogueBuildErrors.js";
import {
  checkVersionNumbering,
  type PublishedVersion,
  readPublishedVersion,
} from "./publishedVersions.js";
import { contentHashOf } from "./staticFileNaming.js";

const SN2_SLUG = "sn2-hydroxide-bromomethane";

let toolkit: ChemistryToolkit;
let folder: string;

beforeAll(async () => {
  toolkit = await loadChemistryToolkit();
});

beforeEach(() => {
  folder = newTemporaryFolder("published-versions");
});

function errorCodeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof CatalogueBuildError) {
      return `${error.errorCode}: ${error.message}`;
    }
    throw error;
  }
  return "no error";
}

describe("readPublishedVersion", () => {
  it("reads an example reaction with its slug, version and hash", () => {
    const reactionPath = exampleReactionPath(`${SN2_SLUG}.json`);
    const { publishedVersion, lintWarnings } = readPublishedVersion(reactionPath, toolkit);
    const document = readJsonFile(reactionPath);
    expect(publishedVersion).toEqual({
      reactionSlug: SN2_SLUG,
      reactionVersion: 1,
      reactionDocument: document,
      contentHash: contentHashOf(document),
      sourcePath: reactionPath,
    });
    expect(lintWarnings).toEqual([]);
  });

  it("returns lint warnings without refusing", () => {
    const reactionPath = copyExampleReaction(folder, SN2_SLUG);
    leaveOneHintTier(reactionPath);
    const { lintWarnings } = readPublishedVersion(reactionPath, toolkit);
    expect(lintWarnings.map((finding) => finding.lintRuleId)).toEqual([
      "fewer-than-three-hint-tiers",
    ]);
  });

  it("refuses a file with a lint error and names the rule", () => {
    const reactionPath = copyExampleReaction(folder, SN2_SLUG, { difficultyTier: 7 });
    const refusal = errorCodeOf(() => readPublishedVersion(reactionPath, toolkit));
    expect(refusal).toMatch(/^reaction-file-has-lint-errors: /);
    expect(refusal).toContain(reactionPath);
    expect(refusal).toContain("schema-violation");
  });

  it.each([[undefined], ["{not json"]])("refuses a missing or broken file (%j)", (fileText) => {
    const reactionPath = join(folder, "broken.json");
    if (fileText !== undefined) {
      writeFileSync(reactionPath, fileText, "utf-8");
    }
    expect(errorCodeOf(() => readPublishedVersion(reactionPath, toolkit))).toMatch(
      /^reaction-file-not-readable: /,
    );
  });
});

function standInVersion(versionRef: string): PublishedVersion {
  const [reactionSlug = "", versionText = ""] = versionRef.split("@");
  const reactionDocument = { reactionSlug, reactionVersion: Number(versionText) };
  return {
    reactionSlug,
    reactionVersion: Number(versionText),
    reactionDocument,
    contentHash: contentHashOf(reactionDocument),
    sourcePath: versionRef,
  };
}

describe("checkVersionNumbering", () => {
  it("passes consecutive versions in any order", () => {
    const versions = ["sn2@2", "aldol@1", "sn2@1", "sn2@3"].map(standInVersion);
    const refusal = errorCodeOf(() => {
      checkVersionNumbering(versions);
    });
    expect(refusal).toBe("no error");
  });

  it.each([
    [["sn2@1", "sn2@1"], "reaction-version-duplicated"],
    [["sn2@1", "sn2@3"], "reaction-versions-not-consecutive"],
    [["aldol@1", "sn2@2"], "reaction-versions-not-consecutive"],
  ])("refuses %j with %s", (refs, expectedErrorCode) => {
    const refusal = errorCodeOf(() => {
      checkVersionNumbering(refs.map(standInVersion));
    });
    expect(refusal.startsWith(`${expectedErrorCode}: `)).toBe(true);
    expect(refusal).toContain("sn2");
  });
});
