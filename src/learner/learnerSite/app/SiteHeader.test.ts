// @vitest-environment jsdom
/**
 * Component tests for SiteHeader.svelte: the About link sits just left of the theme switch, on
 * the learner site and on Create, and is marked when its page is open.
 */
import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import { aboutLink, navigationTabs } from "../model/siteNavigation.js";
import SiteHeader from "./SiteHeader.svelte";

const learnerTabs = navigationTabs({ learnerSiteAddress: "", createAddress: null });

test("shows About just before the theme switch", () => {
  render(SiteHeader, {
    props: { tabs: learnerTabs, about: aboutLink(""), currentTab: null, brandHref: "#/" },
  });
  const about = screen.getByRole("link", { name: "About" });
  expect(about.getAttribute("href")).toBe("#/about");
  const theme = screen.getByRole("button", { name: /theme/i });
  expect(about.nextElementSibling).toBe(theme);
});

test("marks About as the current page on #/about", () => {
  render(SiteHeader, {
    props: { tabs: learnerTabs, about: aboutLink(""), currentTab: "about", brandHref: "#/" },
  });
  expect(screen.getByRole("link", { name: "About" }).getAttribute("aria-current")).toBe("page");
});

test("keeps About just before the theme switch on Create, after Sign out", () => {
  render(SiteHeader, {
    props: {
      tabs: navigationTabs({ learnerSiteAddress: null, createAddress: "/" }),
      about: aboutLink(null),
      currentTab: "create",
      brandHref: "/",
      onSignOut: () => undefined,
    },
  });
  const source = screen.getByRole("link", { name: "Source code" });
  expect(source.previousElementSibling?.textContent).toBe("Sign out");
  expect(source.nextElementSibling?.textContent).toContain("Theme");
});
