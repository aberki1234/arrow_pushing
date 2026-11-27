// @vitest-environment jsdom
/**
 * Component tests for the About page (#/about, 2026-11-27): where the source code is (the AGPL
 * asks that the site's users be offered it), the two licences, and the credits.
 */
import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import { SOURCE_CODE_ADDRESS } from "../model/siteNavigation.js";
import AboutPage from "./AboutPage.svelte";

function hrefOf(linkName: RegExp): string | null {
  return screen.getByRole("link", { name: linkName }).getAttribute("href");
}

test("links to the source code and says the site is open source under the AGPL", () => {
  render(AboutPage, { props: { createAddress: null } });
  expect(hrefOf(/source code/i)).toBe(SOURCE_CODE_ADDRESS);
  expect(document.body.textContent).toContain("GNU Affero General Public License");
});

test("links each licence's full text: AGPL for the code, CC BY-SA 4.0 for the reactions", () => {
  render(AboutPage, { props: { createAddress: null } });
  expect(hrefOf(/AGPL-3\.0-or-later/)).toBe(`${SOURCE_CODE_ADDRESS}/blob/main/LICENSE`);
  expect(hrefOf(/CC BY-SA 4\.0/)).toBe(`${SOURCE_CODE_ADDRESS}/blob/main/content/LICENSE`);
});

test("credits the author, the reactions' authors, the textbook and the software", () => {
  render(AboutPage, { props: { createAddress: null } });
  const credits = screen.getByRole("heading", { name: "Credits" }).closest("section");
  // As displayed: the source's line breaks collapse to single spaces.
  const creditsText = (credits?.textContent ?? "").replace(/\s+/g, " ");
  for (const credit of ["Maksim Lisau", "named on each reaction", "Clayden", "RDKit", "Ketcher"]) {
    expect(creditsText).toContain(credit);
  }
});

test("invites contributions through Create when its address is known", () => {
  render(AboutPage, { props: { createAddress: "https://create.arrowpushing.com" } });
  expect(hrefOf(/write a reaction in Create/i)).toBe("https://create.arrowpushing.com/");
  expect(hrefOf(/report a problem/i)).toBe(`${SOURCE_CODE_ADDRESS}/issues`);
});

test("leaves the Create link out when its address is unknown", () => {
  render(AboutPage, { props: { createAddress: null } });
  expect(screen.queryByRole("link", { name: /write a reaction in Create/i })).toBeNull();
});
