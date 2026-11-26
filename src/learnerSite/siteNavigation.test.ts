/** Tests for siteNavigation.ts: the tabs both top bars show, the learner site's and Create's. */
import { expect, it } from "vitest";
import { navigationTabs } from "./siteNavigation.js";

const hrefsOf = (tabs: ReturnType<typeof navigationTabs>): string[] =>
  tabs.map((tab) => `${tab.label} ${tab.href}`);

it("links the learner site's own pages by hash, and Create by its address", () => {
  const tabs = navigationTabs({
    learnerSiteAddress: "",
    createAddress: "https://create.arrowpushing.com",
  });
  expect(hrefsOf(tabs)).toEqual([
    "Home #/",
    "Daily #/daily",
    "Learn #/learn",
    "Practice #/practice",
    "Progress #/progress",
    "Create https://create.arrowpushing.com/",
  ]);
});

it("leaves Create out when the build does not know its address", () => {
  const tabs = navigationTabs({ learnerSiteAddress: "", createAddress: null });
  expect(tabs.map((tab) => tab.tabName)).toEqual([
    "home",
    "daily",
    "learn",
    "practice",
    "progress",
  ]);
});

it("links Create's tabs to the learner site's pages, and Create to itself", () => {
  const tabs = navigationTabs({
    learnerSiteAddress: "https://arrowpushing.com/",
    createAddress: "/",
  });
  expect(hrefsOf(tabs)).toEqual([
    "Home https://arrowpushing.com/#/",
    "Daily https://arrowpushing.com/#/daily",
    "Learn https://arrowpushing.com/#/learn",
    "Practice https://arrowpushing.com/#/practice",
    "Progress https://arrowpushing.com/#/progress",
    "Create /",
  ]);
});

it("shows only Create where the learner site's address is unknown (make editor)", () => {
  expect(hrefsOf(navigationTabs({ learnerSiteAddress: null, createAddress: "/" }))).toEqual([
    "Create /",
  ]);
});
