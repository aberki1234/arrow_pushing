/** Tests for siteRoutes.ts. */
import { expect, test } from "vitest";
import { parseSiteRoute, siteRouteHash } from "./siteRoutes.js";

test("the play route carries a reaction version ref", () => {
  expect(parseSiteRoute("#/play/aldol-addition-base@3")).toEqual({
    routeName: "play",
    reactionVersionRef: "aldol-addition-base@3",
  });
});

test("an empty, unknown or malformed hash is home", () => {
  for (const hash of ["", "#", "#/", "#/nowhere", "#/play/", "#/play/Aldol@1", "#/play/aldol"]) {
    expect(parseSiteRoute(hash)).toEqual({ routeName: "home" });
  }
});

test("daily, progress, and practice with or without its filter query", () => {
  expect(parseSiteRoute("#/daily")).toEqual({ routeName: "daily" });
  expect(parseSiteRoute("#/progress")).toEqual({ routeName: "progress" });
  expect(parseSiteRoute("#/practice")).toEqual({ routeName: "practice", practiceQuery: "" });
  expect(parseSiteRoute("#/practice?type=carbonyl&status=new")).toEqual({
    routeName: "practice",
    practiceQuery: "type=carbonyl&status=new",
  });
});

test("routes print back to hashes", () => {
  const routes = [
    { routeName: "home" },
    { routeName: "daily" },
    { routeName: "progress" },
    { routeName: "practice", practiceQuery: "" },
    { routeName: "practice", practiceQuery: "type=carbonyl" },
    { routeName: "play", reactionVersionRef: "sn2-hydroxide-bromomethane@1" },
  ] as const;
  expect(routes.map(siteRouteHash)).toEqual([
    "#/",
    "#/daily",
    "#/progress",
    "#/practice",
    "#/practice?type=carbonyl",
    "#/play/sn2-hydroxide-bromomethane@1",
  ]);
  for (const route of routes) {
    expect(parseSiteRoute(siteRouteHash(route))).toEqual(route);
  }
});
