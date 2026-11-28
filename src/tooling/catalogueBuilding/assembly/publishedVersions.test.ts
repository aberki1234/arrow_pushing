/** Tests for publishedVersions.ts: reading, the lint gate and version numbering. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type ChemistryToolkit,
  loadChemistryToolkit,
} from "../../chemistryToolkit/chemistryToolkit.js";
import { standInReactionFile } from "../../../testSupport/exampleReactionFiles.js";
import { exampleReactionPath } from "../../../testSupport/fixtureFiles.js";
import {
  copyExampleReaction,
  leaveOneHintTier,
  newTemporaryFolder,
  readJsonFile,
} from "../../../testSupport/reactionCopies.js";
import { CatalogueBuildError } from "../naming/catalogueBuildErrors.js";
import {
  checkVersionNumbering,
  type PublishedVersion,
  readPublishedVersion,
  supersededVersionPaths,
} from "./publishedVersions.js";
import { contentHashOf } from "../naming/staticFileNaming.js";

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
  const reactionDocument = standInReactionFile(versionRef);
  return {
    reactionSlug: reactionDocument.reactionSlug,
    reactionVersion: reactionDocument.reactionVersion,
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

describe("readPublishedVersion for a superseded version", () => {
  it("reports a lint error in a superseded version, but refuses it in the newest", () => {
    // Published versions are history: a lint rule added later (here the item 12c wedge check)
    // must not stop the build over an old version, only over the version learners now get.
    const reactionPath = copyExampleReaction(folder, "sn2-2-bromobutane-inversion");
    const document = readJsonFile(reactionPath) as {
      stateIdToState: Record<string, Record<string, unknown>>;
    };
    const products = document.stateIdToState.products ?? {};
    products.bondToWedgeStyle = { "2-5": "dash" };
    writeFileSync(reactionPath, JSON.stringify(document), "utf-8");
    const { lintWarnings } = readPublishedVersion(reactionPath, toolkit, { superseded: true });
    expect(lintWarnings.map((finding) => finding.lintRuleId)).toEqual([
      "wedges-disagree-with-smiles",
    ]);
    expect(errorCodeOf(() => readPublishedVersion(reactionPath, toolkit))).toMatch(
      /^reaction-file-has-lint-errors: /,
    );
  });
});

describe("supersededVersionPaths", () => {
  it("names every file but the newest version of each reaction", () => {
    const first = copyExampleReaction(folder, SN2_SLUG);
    const second = copyExampleReaction(folder, SN2_SLUG, {
      reactionVersion: 2,
      previousReactionVersion: 1,
    });
    const other = copyExampleReaction(folder, "aldol-addition-base");
    expect([...supersededVersionPaths([second, first, other])]).toEqual([first]);
  });
});
