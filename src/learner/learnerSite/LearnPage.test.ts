// @vitest-environment jsdom
/**
 * Component tests for the Learn page (item 11): one card per level, a level's tracks in code
 * order as horizontal cards with their showcase drawn whole, planned tracks as "Coming soon", and
 * levels without a live track folded. The grouping itself is tested in
 * src/learner/learnTracks/trackLevels.test.ts.
 */
import { render, screen, within } from "@testing-library/svelte";
import { beforeEach, expect, test } from "vitest";
import { PROGRESS_STORAGE_KEY } from "../learnerProgress/learnerProgress.js";
import { exampleLearnCatalogue } from "../../testSupport/trackEdits.js";
import { browserStorage } from "./browserStorage.js";
import LearnPage from "./LearnPage.svelte";

beforeEach(() => {
  browserStorage.removeItem(PROGRESS_STORAGE_KEY);
});

function levelCard(name: string): HTMLElement {
  const heading = screen.getByRole("heading", { level: 2, name: new RegExp(name) });
  const card = heading.closest(".level");
  if (!(card instanceof HTMLElement)) {
    throw new Error(`no level card for ${name}`);
  }
  return card;
}

test("the levels come in curriculum order", () => {
  render(LearnPage, { props: { catalogue: exampleLearnCatalogue() } });
  expect(
    screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent.trim()),
  ).toEqual([
    expect.stringContaining("Foundations"),
    expect.stringContaining("Core"),
    expect.stringContaining("Advanced"),
    expect.stringContaining("Graduate"),
  ]);
});

test("a live track is a card with its code, its showcase drawn whole and a Start button", () => {
  render(LearnPage, { props: { catalogue: exampleLearnCatalogue() } });
  const foundations = levelCard("Foundations");
  const track = within(foundations).getByRole("heading", { level: 3, name: "First mechanisms" });
  const card = track.closest(".track-card");
  if (!(card instanceof HTMLElement)) {
    throw new Error("no track card");
  }
  expect(card.textContent).toContain("F1");
  expect(card.querySelectorAll("svg.scheme-species").length).toBeGreaterThan(0);
  expect(within(card).queryByLabelText("Product hidden")).toBeNull();
  expect(within(card).getByRole("link", { name: /Start/ }).getAttribute("href")).toBe(
    "#/learn/first-mechanisms/polar-steps/sn2-hydroxide-bromomethane",
  );
});

test("the planned tracks of an open level are faded Coming soon cards without a picture", () => {
  render(LearnPage, { props: { catalogue: exampleLearnCatalogue() } });
  const planned = within(levelCard("Foundations")).getByText("Carboxylic acid derivatives");
  const card = planned.closest(".track-card");
  expect(card?.classList.contains("planned")).toBe(true);
  expect(card?.textContent).toContain("Coming soon");
  expect(card?.querySelectorAll("svg.scheme-species")).toHaveLength(0);
});

test("a level without a live track is folded and lists its planned tracks", () => {
  render(LearnPage, { props: { catalogue: exampleLearnCatalogue() } });
  const core = levelCard("Core");
  expect(core.tagName).toBe("DETAILS");
  expect(core.hasAttribute("open")).toBe(false);
  expect(core.textContent).toContain("Enols and enolates");
  expect(levelCard("Foundations").tagName).toBe("SECTION");
});
