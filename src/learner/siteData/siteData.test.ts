/** Tests for siteData.ts with a fake fetcher over the shared fixtures. */
import { expect, test } from "vitest";
import {
  exampleReactionDocuments,
  isRecord,
  readFixtureJson,
} from "../../testSupport/fixtureFiles.js";
import {
  CATALOGUE_PATH,
  type JsonFetcher,
  SiteDataError,
  loadCatalogue,
  loadReactionDocument,
} from "./siteData.js";

function exampleCatalogue(): Record<string, unknown> {
  const cases = readFixtureJson("catalogue/catalogue_reading_cases.json");
  const catalogue = isRecord(cases) ? cases["catalogue"] : undefined;
  if (!isRecord(catalogue)) {
    throw new Error("the reading cases must hold a catalogue");
  }
  return catalogue;
}

function sn2Document(): Record<string, unknown> {
  const found = exampleReactionDocuments().find(
    ([name]) => name === "sn2-hydroxide-bromomethane.json",
  );
  if (found === undefined) {
    throw new Error("no SN2 example");
  }
  return found[1];
}

/** A fetcher serving fixed paths; anything else is not found. */
function fakeFetcher(pathToJson: Record<string, unknown>): JsonFetcher {
  return (sitePath) =>
    Object.hasOwn(pathToJson, sitePath)
      ? Promise.resolve(pathToJson[sitePath])
      : Promise.reject(new SiteDataError("not-found", `${sitePath} not found`));
}

async function errorCodeOf(loading: Promise<unknown>): Promise<string> {
  try {
    await loading;
  } catch (error) {
    return error instanceof SiteDataError ? error.errorCode : `other: ${String(error)}`;
  }
  return "no error";
}

test("the catalogue is fetched and read", async () => {
  const catalogue = await loadCatalogue(fakeFetcher({ [CATALOGUE_PATH]: exampleCatalogue() }));
  expect(catalogue.reactions).toHaveLength(2);
});

test("an invalid catalogue is refused", async () => {
  const broken = { ...exampleCatalogue(), formatVersion: 9 };
  expect(await errorCodeOf(loadCatalogue(fakeFetcher({ [CATALOGUE_PATH]: broken })))).toBe(
    "invalid-catalogue",
  );
});

test("a reaction version is fetched from its hashed path", async () => {
  const fetcher = fakeFetcher({
    [CATALOGUE_PATH]: exampleCatalogue(),
    "r/sn2-hydroxide-bromomethane/1.aaaaaaaa.json": sn2Document(),
  });
  const catalogue = await loadCatalogue(fetcher);
  const document = await loadReactionDocument(fetcher, catalogue, "sn2-hydroxide-bromomethane@1");
  expect(document["title"]).toBe("SN2 substitution");
});

test("unknown refs, missing files, invalid files and mismatched files are refused", async () => {
  // Version 1's file served where version 2 should be.
  const wrongVersion = sn2Document();
  const fetcher = fakeFetcher({
    [CATALOGUE_PATH]: exampleCatalogue(),
    "r/sn2-hydroxide-bromomethane/2.bbbbbbbb.json": wrongVersion,
    "r/aldol-addition-base/1.01234567.json": { title: "not a reaction" },
  });
  const catalogue = await loadCatalogue(fetcher);
  const load = (ref: string): Promise<unknown> => loadReactionDocument(fetcher, catalogue, ref);
  expect(await errorCodeOf(load("e2-elimination@1"))).toBe("unknown-reaction-version");
  expect(await errorCodeOf(load("sn2-hydroxide-bromomethane@1"))).toBe("not-found");
  expect(await errorCodeOf(load("aldol-addition-base@1"))).toBe("invalid-reaction-file");
  expect(await errorCodeOf(load("sn2-hydroxide-bromomethane@2"))).toBe("invalid-reaction-file");
});
