/**
 * Assemble catalogue.json from the published versions and the previous catalogue.
 *
 * Steps
 *   1. checkAgainstPreviousCatalogue(): every version the previous catalogue lists is still given,
 *      with the same content hash, and every calendar ref names a given version.
 *   2. catalogueEntries(): one entry per slug, sorted by slug, read from its latest version.
 *   3. eligibleVersionRefs(): the latest version of each slug whose latest version is
 *      dailyPuzzleEligible.
 *   4. assembleCatalogue(): all of the above plus the extended daily calendar (dailyCalendar),
 *      and each showcased track's product (withShowcaseProducts).
 *
 * An entry and a track carry what their cards draw (item 11): the conditions, the start state
 * and, for a track's showcase, the state where the preferred route ends.
 */
import {
  type Catalogue,
  type CatalogueAbbreviatedGroup,
  type CatalogueEntry,
  type CatalogueTrack,
  type SchemeState,
  catalogueSchemaViolations,
} from "../../core/catalogue/catalogueReading.js";
import { endOfPreferredRoute } from "../../core/reactionFiles/preferredRoute.js";
import { CatalogueBuildError } from "./catalogueBuildErrors.js";
import { appendedDailyCalendar } from "./dailyCalendar.js";
import type { PublishedVersion } from "./publishedVersions.js";
import { reactionVersionRef } from "./staticFileNaming.js";

const CATALOGUE_FORMAT_VERSION = 1;

/** A catalogue as the build writes it (and reads back from the previous build). */
export type BuiltCatalogue = Omit<Catalogue, "formatVersion"> & { readonly formatVersion: number };

function compareText(first: string, second: string): number {
  if (first === second) {
    return 0;
  }
  return first < second ? -1 : 1;
}

/**
 * The JSON pointer of every place the catalogue breaks schema/catalogue.schema.json, sorted and
 * without repeats; empty if it is valid.
 */
export function catalogueSchemaViolationPaths(catalogue: unknown): string[] {
  const paths = catalogueSchemaViolations(catalogue).map((violation) => violation.instancePath);
  return [...new Set(paths)].sort(compareText);
}

function refToContentHash(publishedVersions: readonly PublishedVersion[]): Map<string, string> {
  return new Map(
    publishedVersions.map((version) => [
      reactionVersionRef(version.reactionSlug, version.reactionVersion),
      version.contentHash,
    ]),
  );
}

/**
 * Throws CatalogueBuildError published-version-missing, content-hash-changed or
 * calendar-ref-not-published. The previous catalogue must already be schema-valid.
 */
export function checkAgainstPreviousCatalogue(
  previousCatalogue: BuiltCatalogue,
  publishedVersions: readonly PublishedVersion[],
): void {
  const givenRefToHash = refToContentHash(publishedVersions);
  for (const entry of previousCatalogue.reactions) {
    for (const [versionText, previousHash] of Object.entries(entry.reactionVersionToContentHash)) {
      const versionRef = reactionVersionRef(entry.reactionSlug, Number(versionText));
      const givenHash = givenRefToHash.get(versionRef);
      if (givenHash === undefined) {
        throw new CatalogueBuildError(
          "published-version-missing",
          `${versionRef} was published in the previous catalogue but is not given`,
        );
      }
      if (givenHash !== previousHash) {
        throw new CatalogueBuildError(
          "content-hash-changed",
          `${versionRef} differs from the published version (content hash ` +
            `${previousHash.slice(0, 8)}… now ${givenHash.slice(0, 8)}…); a published version ` +
            "never changes: publish a new version instead",
        );
      }
    }
  }
  for (const [dateText, versionRef] of Object.entries(
    previousCatalogue.dateToDailyReactionVersionRef,
  )) {
    if (!givenRefToHash.has(versionRef)) {
      throw new CatalogueBuildError(
        "calendar-ref-not-published",
        `the daily calendar plays ${versionRef} on ${dateText}, which is not given`,
      );
    }
  }
}

/** The latest version of each slug, sorted by slug. */
function latestVersions(publishedVersions: readonly PublishedVersion[]): PublishedVersion[] {
  const slugToLatest = new Map<string, PublishedVersion>();
  for (const version of publishedVersions) {
    const latest = slugToLatest.get(version.reactionSlug);
    if (latest === undefined || version.reactionVersion > latest.reactionVersion) {
      slugToLatest.set(version.reactionSlug, version);
    }
  }
  return [...slugToLatest.values()].sort((first, second) =>
    compareText(first.reactionSlug, second.reactionSlug),
  );
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function recordOrNull(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

/** The drawing fields of the document's state `stateId`, or null if it has no such state. */
function schemeStateOf(
  document: Readonly<Record<string, unknown>>,
  stateId: string,
): SchemeState | null {
  const state = recordOrNull(recordOrNull(document["stateIdToState"])?.[stateId]);
  if (state === null) {
    return null;
  }
  // The reaction file passed its schema, so these fields have the shapes SchemeState names.
  const wedges = state["bondToWedgeStyle"] as SchemeState["bondToWedgeStyle"];
  return {
    mappedSmiles: String(state["mappedSmiles"]),
    mapNumberToCoordinates: state[
      "mapNumberToCoordinates"
    ] as SchemeState["mapNumberToCoordinates"],
    ...(wedges === undefined ? {} : { bondToWedgeStyle: wedges }),
  };
}

/** What the reaction's card draws: the conditions, the start state, the abbreviated groups. */
function schemeFieldsOf(
  document: Readonly<Record<string, unknown>>,
): Pick<CatalogueEntry, "conditionsLabel" | "startState" | "abbreviatedGroups"> {
  const startState = schemeStateOf(document, String(document["startStateId"]));
  const groups = document["abbreviatedGroups"];
  return {
    ...(typeof document["conditionsLabel"] === "string"
      ? { conditionsLabel: document["conditionsLabel"] }
      : {}),
    ...(startState === null ? {} : { startState }),
    ...(Array.isArray(groups) ? { abbreviatedGroups: groups as CatalogueAbbreviatedGroup[] } : {}),
  };
}

/** One entry per slug, sorted by slug; its texts and facets come from the latest version. */
export function catalogueEntries(publishedVersions: readonly PublishedVersion[]): CatalogueEntry[] {
  return latestVersions(publishedVersions).map((latest) => {
    const versionToHash = Object.fromEntries(
      publishedVersions
        .filter((version) => version.reactionSlug === latest.reactionSlug)
        .sort((first, second) => first.reactionVersion - second.reactionVersion)
        .map((version) => [String(version.reactionVersion), version.contentHash]),
    );
    const document = latest.reactionDocument;
    return {
      reactionSlug: latest.reactionSlug,
      latestReactionVersion: latest.reactionVersion,
      reactionVersionToContentHash: versionToHash,
      title: String(document.title),
      subtitle: textOrNull(document.subtitle),
      reactionClasses: Array.isArray(document.reactionClasses)
        ? document.reactionClasses.map(String)
        : [],
      difficultyTier: Number(document.difficultyTier),
      dailyPuzzleEligible: document.dailyPuzzleEligible === true,
      ...schemeFieldsOf(document),
    };
  });
}

/**
 * Each track with a showcase gains `showcaseProductState`: where the preferred route of its
 * reaction's latest version ends.
 */
export function withShowcaseProducts(
  tracks: readonly CatalogueTrack[],
  publishedVersions: readonly PublishedVersion[],
): CatalogueTrack[] {
  const slugToLatest = new Map(
    latestVersions(publishedVersions).map((version) => [version.reactionSlug, version]),
  );
  return tracks.map((track) => {
    const showcase =
      track.showcaseReactionSlug === undefined
        ? undefined
        : slugToLatest.get(track.showcaseReactionSlug);
    if (showcase === undefined) {
      return track;
    }
    const document = showcase.reactionDocument;
    const productState = schemeStateOf(document, endOfPreferredRoute(document));
    return productState === null ? track : { ...track, showcaseProductState: productState };
  });
}

/** The latest version ref of each slug whose latest version is dailyPuzzleEligible, sorted. */
export function eligibleVersionRefs(publishedVersions: readonly PublishedVersion[]): string[] {
  return latestVersions(publishedVersions)
    .filter((latest) => latest.reactionDocument.dailyPuzzleEligible === true)
    .map((latest) => reactionVersionRef(latest.reactionSlug, latest.reactionVersion));
}

/** The previous catalogue, checked against the schema; throws previous-catalogue-invalid. */
function validPreviousCatalogue(previousCatalogue: unknown): BuiltCatalogue {
  const violationPaths = catalogueSchemaViolationPaths(previousCatalogue);
  if (violationPaths.length > 0) {
    throw new CatalogueBuildError(
      "previous-catalogue-invalid",
      "the previous catalogue breaks schema/catalogue.schema.json at " +
        violationPaths.map((path) => path || "/").join(", "),
    );
  }
  return previousCatalogue as BuiltCatalogue; // valid against the schema just above
}

/**
 * The new catalogue. `previousCatalogue` undefined starts a new calendar on `buildDate`.
 * `tracks`: the compiled Learn tracks (trackCompiling.ts). Throws CatalogueBuildError
 * (previous-catalogue-invalid, the checks above, or no-eligible-reactions).
 */
export function assembleCatalogue(
  publishedVersions: readonly PublishedVersion[],
  previousCatalogue: unknown,
  buildDate: string,
  builtAt: string,
  tracks: readonly CatalogueTrack[] = [],
): BuiltCatalogue {
  let previousDateToRef: Readonly<Record<string, string>> = {};
  if (previousCatalogue !== undefined) {
    const previous = validPreviousCatalogue(previousCatalogue);
    checkAgainstPreviousCatalogue(previous, publishedVersions);
    previousDateToRef = previous.dateToDailyReactionVersionRef;
  }
  return {
    formatVersion: CATALOGUE_FORMAT_VERSION,
    builtAt,
    reactions: catalogueEntries(publishedVersions),
    tracks: withShowcaseProducts(tracks, publishedVersions),
    dateToDailyReactionVersionRef: appendedDailyCalendar(
      previousDateToRef,
      eligibleVersionRefs(publishedVersions),
      buildDate,
    ),
  };
}
