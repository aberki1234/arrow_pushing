/** Tests for siteRoutes.ts. */
import { expect, test } from "vitest";
import { type SiteRoute, parseSiteRoute, siteRouteHash } from "./siteRoutes.js";

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

test("daily, progress, about, and practice with or without its filter query", () => {
  expect(parseSiteRoute("#/daily")).toEqual({ routeName: "daily" });
  expect(parseSiteRoute("#/progress")).toEqual({ routeName: "progress" });
  expect(parseSiteRoute("#/about")).toEqual({ routeName: "about" });
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
    { routeName: "about" },
    { routeName: "practice", practiceQuery: "" },
    { routeName: "practice", practiceQuery: "type=carbonyl" },
    { routeName: "play", reactionVersionRef: "sn2-hydroxide-bromomethane@1" },
  ] as const;
  expect(routes.map(siteRouteHash)).toEqual([
    "#/",
    "#/daily",
    "#/progress",
    "#/about",
    "#/practice",
    "#/practice?type=carbonyl",
    "#/play/sn2-hydroxide-bromomethane@1",
  ]);
  for (const route of routes) {
    expect(parseSiteRoute(siteRouteHash(route))).toEqual(route);
  }
});

test("the Learn routes: tracks, a track, a problem set, and a reaction played from it", () => {
  const learnRoute = (
    trackSlug: string | null,
    problemSetSlug: string | null,
    reactionSlug: string | null,
  ): SiteRoute => ({ routeName: "learn", trackSlug, problemSetSlug, reactionSlug });
  const hashToRoute: [string, SiteRoute][] = [
    ["#/learn", learnRoute(null, null, null)],
    ["#/learn/aromatic-chemistry", learnRoute("aromatic-chemistry", null, null)],
    [
      "#/learn/aromatic-chemistry/arenium-ion",
      learnRoute("aromatic-chemistry", "arenium-ion", null),
    ],
    [
      "#/learn/aromatic-chemistry/arenium-ion/bromination-benzene",
      learnRoute("aromatic-chemistry", "arenium-ion", "bromination-benzene"),
    ],
  ];
  for (const [hash, route] of hashToRoute) {
    expect(parseSiteRoute(hash)).toEqual(route);
    expect(siteRouteHash(route)).toBe(hash);
  }
});

test("a malformed Learn hash is home", () => {
  for (const hash of ["#/learn/", "#/learn/Aromatic", "#/learn/a/b/c/d", "#/learnt"]) {
    expect(parseSiteRoute(hash)).toEqual({ routeName: "home" });
  }
});
