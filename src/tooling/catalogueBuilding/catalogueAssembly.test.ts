/**
 * Tests for catalogueAssembly.ts: entries, eligibility, the catalogue schema, the checks against
 * the previous catalogue, and the assembled catalogue.
 */
import { describe, expect, it } from "vitest";
import {
  exampleReactionDocuments,
  isRecord,
  readFixtureJson,
} from "../../testSupport/fixtureFiles.js";
import {
  assembleCatalogue,
  type BuiltCatalogue,
  catalogueEntries,
  catalogueSchemaViolationPaths,
  checkAgainstPreviousCatalogue,
  eligibleVersionRefs,
} from "./catalogueAssembly.js";
import { CatalogueBuildError } from "./catalogueBuildErrors.js";
import type { PublishedVersion } from "./publishedVersions.js";
import { contentHashOf } from "./staticFileNaming.js";

const BUILT_AT = "2026-12-01T10:00:00Z";

/** A published version holding only the keys the catalogue reads. */
function standInVersion(
  versionRef: string,
  { eligible = true, subtitle }: { eligible?: boolean; subtitle?: string } = {},
): PublishedVersion {
  const [reactionSlug = "", versionText = ""] = versionRef.split("@");
  const reactionDocument: Record<string, unknown> = {
    reactionSlug,
    reactionVersion: Number(versionText),
    title: `${reactionSlug} v${versionText}`,
    reactionClasses: ["substitution"],
    difficultyTier: 2,
    dailyPuzzleEligible: eligible,
    ...(subtitle === undefined ? {} : { subtitle }),
  };
  return {
    reactionSlug,
    reactionVersion: Number(versionText),
    reactionDocument,
    contentHash: contentHashOf(reactionDocument),
    sourcePath: `${versionRef}.json`,
  };
}

function expectBuildError(run: () => unknown, errorCode: string, messagePart: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(CatalogueBuildError);
    expect(error instanceof CatalogueBuildError && error.errorCode).toBe(errorCode);
    expect(error instanceof Error && error.message).toContain(messagePart);
    return;
  }
  throw new Error(`expected CatalogueBuildError ${errorCode}`);
}

it("gives one entry per slug, sorted, read from the latest version", () => {
  const sn2First = standInVersion("sn2@1");
  const sn2Second = standInVersion("sn2@2", { subtitle: "OH⁻" });
  const entries = catalogueEntries([sn2Second, standInVersion("aldol@1"), sn2First]);
  expect(entries.map((entry) => entry.reactionSlug)).toEqual(["aldol", "sn2"]);
  expect(entries[0]?.subtitle).toBeNull();
  expect(entries[1]).toEqual({
    reactionSlug: "sn2",
    latestReactionVersion: 2,
    reactionVersionToContentHash: { "1": sn2First.contentHash, "2": sn2Second.contentHash },
    title: "sn2 v2",
    subtitle: "OH⁻",
    reactionClasses: ["substitution"],
    difficultyTier: 2,
    dailyPuzzleEligible: true,
  });
});

/** An example reaction (fixtures/reactions/<slug>.json) as published version 1, then `edit`ed. */
function exampleVersion(
  reactionSlug: string,
  edit: (document: Record<string, unknown>) => void = () => undefined,
): PublishedVersion {
  const found = exampleReactionDocuments().find(([name]) => name === `${reactionSlug}.json`);
  if (found === undefined) {
    throw new Error(`no example reaction ${reactionSlug}`);
  }
  const reactionDocument = structuredClone(found[1]);
  edit(reactionDocument);
  return {
    reactionSlug,
    reactionVersion: 1,
    reactionDocument,
    contentHash: contentHashOf(reactionDocument),
    sourcePath: `${reactionSlug}.json`,
  };
}

/** The state `stateId` of a published version's document. */
function stateOf(version: PublishedVersion, stateId: string): Record<string, unknown> {
  const stateIdToState = version.reactionDocument["stateIdToState"];
  const state = isRecord(stateIdToState) ? stateIdToState[stateId] : undefined;
  if (!isRecord(state)) {
    throw new Error(`${version.reactionSlug} has no state ${stateId}`);
  }
  return state;
}

it("an entry carries the conditions and the start state as the cards draw it", () => {
  const sn2 = exampleVersion("sn2-hydroxide-bromomethane");
  const reactants = stateOf(sn2, "reactants");
  const [entry] = catalogueEntries([sn2]);
  expect(entry?.conditionsLabel).toBe("NaOH · EtOH/H₂O · 25 °C");
  expect(entry?.startState).toEqual({
    mappedSmiles: reactants["mappedSmiles"],
    mapNumberToCoordinates: reactants["mapNumberToCoordinates"],
  });
  expect(entry && "abbreviatedGroups" in entry).toBe(false);
});

it("an entry keeps the start state's wedges and the reaction's abbreviated groups", () => {
  const wittig = exampleVersion("wittig-methylenation-cyclohexanone", (document) => {
    const stateIdToState = document["stateIdToState"] as Record<string, Record<string, unknown>>;
    const reactants = stateIdToState["reactants"] ?? {};
    reactants["bondToWedgeStyle"] = { "1-2": "wedge" };
  });
  const [entry] = catalogueEntries([wittig]);
  expect(entry?.startState?.bondToWedgeStyle).toEqual({ "1-2": "wedge" });
  expect(entry?.abbreviatedGroups).toEqual(wittig.reactionDocument["abbreviatedGroups"]);
});

it("a showcased track carries the product where its reaction's preferred route ends", () => {
  const versions = ["aldol-addition-base", "sn2-hydroxide-bromomethane"].map((slug) =>
    exampleVersion(slug),
  );
  const unshowcased = {
    trackSlug: "first-mechanisms",
    title: "First mechanisms",
    goal: "Polar steps first.",
    level: "foundations",
    curriculumCode: "F1",
    problemSets: [
      {
        problemSetSlug: "polar-steps",
        title: "Polar steps",
        conceptInOneLine: "Pairs move.",
        conceptCard: "One pair per arrow.",
        checkpoint: false,
        setItems: [{ reactionSlug: "aldol-addition-base", whyThisOne: "Two steps." }],
      },
    ],
  } as const;
  const catalogue = assembleCatalogue(versions, undefined, "2026-12-01", BUILT_AT, [
    { ...unshowcased, showcaseReactionSlug: "aldol-addition-base" },
    { ...unshowcased, trackSlug: "second", curriculumCode: "F2" },
  ]);
  const product = stateOf(versions[0] as PublishedVersion, "aldol-product");
  expect(catalogue.tracks?.[0]?.showcaseProductState).toEqual({
    mappedSmiles: product["mappedSmiles"],
    mapNumberToCoordinates: product["mapNumberToCoordinates"],
  });
  expect(catalogue.tracks?.[1] && "showcaseProductState" in catalogue.tracks[1]).toBe(false);
  expect(catalogueSchemaViolationPaths(catalogue)).toEqual([]);
});

it("reads eligibility from the latest version only", () => {
  const publishedVersions = [
    standInVersion("sn2@1"),
    standInVersion("sn2@2"),
    standInVersion("e2@1"),
    standInVersion("e2@2", { eligible: false }),
    standInVersion("aldol@1", { eligible: false }),
    standInVersion("aldol@2"),
  ];
  expect(eligibleVersionRefs(publishedVersions)).toEqual(["aldol@2", "sn2@2"]);
});

describe("the catalogue schema on the shared reading cases", () => {
  const readingCases = readFixtureJson("catalogue/catalogue_reading_cases.json");
  if (!isRecord(readingCases) || !Array.isArray(readingCases.invalidEdits)) {
    throw new Error("catalogue_reading_cases.json is malformed");
  }
  const invalidEdits = readingCases.invalidEdits.filter(isRecord);

  it("finds the shared example catalogue valid", () => {
    expect(catalogueSchemaViolationPaths(readingCases.catalogue)).toEqual([]);
  });

  it.each(invalidEdits.map((edit) => [String(edit.caseName), edit] as const))(
    "%s: reported at its path",
    (caseName, edit) => {
      const catalogue: unknown = structuredClone(readingCases.catalogue);
      const path = Array.isArray(edit.pathToSet) ? edit.pathToSet.map(String) : [];
      let parent: unknown = catalogue;
      for (const key of path.slice(0, -1)) {
        parent =
          isRecord(parent) || Array.isArray(parent)
            ? (parent as Record<string, unknown>)[key]
            : undefined;
      }
      (parent as Record<string, unknown>)[path[path.length - 1] ?? ""] = edit.newValue;
      expect(catalogueSchemaViolationPaths(catalogue)).toContain(edit.expectedViolationPath);
    },
  );
});

function firstBuild(publishedVersions: readonly PublishedVersion[]): BuiltCatalogue {
  return assembleCatalogue(publishedVersions, undefined, "2026-12-01", BUILT_AT);
}

describe("assembleCatalogue", () => {
  it("a first build starts the calendar on the build date", () => {
    const publishedVersions = [standInVersion("sn2@1"), standInVersion("aldol@1")];
    const catalogue = firstBuild(publishedVersions);
    expect(catalogue.formatVersion).toBe(1);
    expect(catalogue.builtAt).toBe(BUILT_AT);
    expect(catalogue.reactions).toEqual(catalogueEntries(publishedVersions));
    const calendar = catalogue.dateToDailyReactionVersionRef;
    expect(Object.keys(calendar)[0]).toBe("2026-12-01");
    expect(new Set(Object.values(calendar))).toEqual(new Set(["sn2@1", "aldol@1"]));
    expect(catalogueSchemaViolationPaths(catalogue)).toEqual([]);
  });

  it("a later build keeps every date and appends", () => {
    const previous = firstBuild([standInVersion("sn2@1"), standInVersion("aldol@1")]);
    const publishedVersions = ["sn2@1", "aldol@1", "sn2@2", "e2@1"].map((ref) =>
      standInVersion(ref),
    );
    const catalogue = assembleCatalogue(publishedVersions, previous, "2026-12-20", BUILT_AT);
    const calendar = catalogue.dateToDailyReactionVersionRef;
    const previousCalendar = previous.dateToDailyReactionVersionRef;
    for (const [day, ref] of Object.entries(previousCalendar)) {
      expect(calendar[day]).toBe(ref);
    }
    const appendedRefs = Object.entries(calendar)
      .filter(([day]) => !(day in previousCalendar))
      .map(([, ref]) => ref);
    expect(new Set(appendedRefs)).toEqual(new Set(["sn2@2", "aldol@1", "e2@1"]));
  });

  it("refuses an invalid previous catalogue", () => {
    const previous = { ...firstBuild([standInVersion("sn2@1")]), formatVersion: 2 };
    expectBuildError(
      () => assembleCatalogue([standInVersion("sn2@1")], previous, "2026-12-02", BUILT_AT),
      "previous-catalogue-invalid",
      "/formatVersion",
    );
  });
});

it("assembleCatalogue holds the compiled tracks it is given, and none by default", () => {
  const track = {
    trackSlug: "first-mechanisms",
    title: "First mechanisms",
    goal: "Polar steps first.",
    problemSets: [
      {
        problemSetSlug: "polar-steps",
        title: "Polar steps",
        conceptInOneLine: "Pairs move.",
        conceptCard: "One pair per arrow.",
        checkpoint: false,
        setItems: [{ reactionSlug: "sn2", whyThisOne: "One step." }],
      },
    ],
  };
  const publishedVersions = [standInVersion("sn2@1")];
  const withTracks = assembleCatalogue(publishedVersions, undefined, "2026-12-01", BUILT_AT, [
    track,
  ]);
  expect(withTracks.tracks).toEqual([track]);
  expect(catalogueSchemaViolationPaths(withTracks)).toEqual([]);
  expect(firstBuild(publishedVersions).tracks).toEqual([]);
});

it("checkAgainstPreviousCatalogue passes a consistent previous catalogue", () => {
  const publishedVersions = [standInVersion("sn2@1"), standInVersion("aldol@1")];
  expect(() => {
    checkAgainstPreviousCatalogue(firstBuild(publishedVersions), [
      ...publishedVersions,
      standInVersion("sn2@2"),
    ]);
  }).not.toThrow();
});

it("checkAgainstPreviousCatalogue refuses a version dropped since the previous build", () => {
  const previous = {
    ...firstBuild([standInVersion("sn2@1"), standInVersion("aldol@1")]),
    dateToDailyReactionVersionRef: {},
  };
  expectBuildError(
    () => {
      checkAgainstPreviousCatalogue(previous, [standInVersion("sn2@1")]);
    },
    "published-version-missing",
    "aldol@1",
  );
});

it("checkAgainstPreviousCatalogue refuses a changed published version", () => {
  const previous = firstBuild([standInVersion("sn2@1")]);
  expectBuildError(
    () => {
      checkAgainstPreviousCatalogue(previous, [standInVersion("sn2@1", { subtitle: "new" })]);
    },
    "content-hash-changed",
    "sn2@1",
  );
});

it("checkAgainstPreviousCatalogue refuses a calendar ref to a version not given", () => {
  const built = firstBuild([standInVersion("sn2@1")]);
  const previous = {
    ...built,
    dateToDailyReactionVersionRef: {
      ...built.dateToDailyReactionVersionRef,
      "2026-11-30": "ghost@1",
    },
  };
  expectBuildError(
    () => {
      checkAgainstPreviousCatalogue(previous, [standInVersion("sn2@1")]);
    },
    "calendar-ref-not-published",
    "2026-11-30",
  );
});
