/** Tests for siteNavigation.ts: the tabs both top bars show, the learner site's and Create's. */
import { expect, it } from "vitest";
import { aboutLink, navigationTabs, SOURCE_CODE_ADDRESS, topBarLinks } from "./siteNavigation.js";

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

it("links About to the learner site's About page, from either site", () => {
  expect(aboutLink("")).toEqual({ tabName: "about", label: "About", href: "#/about" });
  expect(aboutLink("https://arrowpushing.com")).toEqual({
    tabName: "about",
    label: "About",
    href: "https://arrowpushing.com/#/about",
  });
});

it("links straight to the source code where the learner site's address is unknown", () => {
  expect(aboutLink(null)).toEqual({
    tabName: "about",
    label: "Source code",
    href: SOURCE_CODE_ADDRESS,
  });
  expect(SOURCE_CODE_ADDRESS).toBe("https://github.com/aberki1234/mech_training");
});

it("gives a top bar its tabs and About link together", () => {
  const addresses = { learnerSiteAddress: "https://arrowpushing.com", createAddress: "/" };
  expect(topBarLinks(addresses)).toEqual({
    tabs: navigationTabs(addresses),
    about: aboutLink("https://arrowpushing.com"),
  });
});
