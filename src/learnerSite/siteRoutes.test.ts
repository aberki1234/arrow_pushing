/** Tests for siteRoutes.ts. */
import { expect, test } from "vitest";
import { parseSiteRoute, siteRouteHash } from "./siteRoutes.js";

test("the play route carries a reaction version ref", () => {
  expect(parseSiteRoute("#/play/aldol-addition-base@3")).toEqual({
    routeName: "play",
    reactionVersionRef: "aldol-addition-base@3",
  });
});

test("an empty, unknown or malformed hash is the reaction list", () => {
  for (const hash of ["", "#", "#/", "#/nowhere", "#/play/", "#/play/Aldol@1", "#/play/aldol"]) {
    expect(parseSiteRoute(hash)).toEqual({ routeName: "reactionList" });
  }
});

test("routes print back to hashes", () => {
  expect(siteRouteHash({ routeName: "reactionList" })).toBe("#/");
  const play = { routeName: "play", reactionVersionRef: "sn2-hydroxide-bromomethane@1" } as const;
  expect(siteRouteHash(play)).toBe("#/play/sn2-hydroxide-bromomethane@1");
  expect(parseSiteRoute(siteRouteHash(play))).toEqual(play);
});

test("the daily puzzle has its own route", () => {
  expect(parseSiteRoute("#/daily")).toEqual({ routeName: "daily" });
  expect(siteRouteHash({ routeName: "daily" })).toBe("#/daily");
});
