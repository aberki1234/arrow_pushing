// @vitest-environment jsdom
/**
 * Component tests for the problem set page (item 9b): the wiring of the concept card, the
 * numbered set items with their marks, the Next up button and remembering the problem set for
 * Home. The logic itself is tested in src/learnTracks/.
 */
import { render, screen, within } from "@testing-library/svelte";
import { beforeEach, expect, test } from "vitest";
import {
  PROGRESS_STORAGE_KEY,
  emptyProgress,
  readProgress,
  withRun,
  writeProgress,
} from "../learnerProgress/learnerProgress.js";
import { runOf, stepOf } from "../testSupport/progressExamples.js";
import { exampleLearnCatalogue } from "../testSupport/trackEdits.js";
import { browserStorage } from "./browserStorage.js";
import ProblemSetPage from "./ProblemSetPage.svelte";

beforeEach(() => {
  browserStorage.removeItem(PROGRESS_STORAGE_KEY);
});

function renderPolarSteps(): void {
  render(ProblemSetPage, {
    props: {
      catalogue: exampleLearnCatalogue(),
      trackSlug: "first-mechanisms",
      problemSetSlug: "polar-steps",
    },
  });
}

test("the page shows the problem set, its concept card and numbered set items", () => {
  renderPolarSteps();
  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Polar steps");
  expect(screen.getByText("one pair").tagName).toBe("STRONG");
  const items = within(screen.getByRole("list", { name: "Set items" })).getAllByRole("listitem");
  expect(items.map((item) => item.textContent)).toEqual([
    expect.stringContaining("SN2 substitution"),
    expect.stringContaining("Aldol addition"),
  ]);
  expect(items[0]?.textContent).toContain("One concerted step: attack and loss together.");
});

test("Next up starts the first set item not done, which is marked done", () => {
  writeProgress(
    browserStorage,
    withRun(
      emptyProgress(),
      runOf("sn2-hydroxide-bromomethane@1", "2026-12-01T09:00:00Z", [stepOf("firstTry")]),
    ),
  );
  renderPolarSteps();
  const nextUp = screen.getByRole("link", { name: /Next up/ });
  expect(nextUp.getAttribute("href")).toBe(
    "#/learn/first-mechanisms/polar-steps/aldol-addition-base",
  );
  const items = within(screen.getByRole("list", { name: "Set items" })).getAllByRole("listitem");
  expect(items[0]?.textContent).toContain("Mastered");
  expect(screen.getByText("1 of 2 done")).toBeTruthy();
});

test("opening the page remembers it as the last problem set touched", () => {
  renderPolarSteps();
  expect(readProgress(browserStorage).lastProblemSetRef).toBe("first-mechanisms/polar-steps");
});

test("an unknown problem set says so", () => {
  render(ProblemSetPage, {
    props: {
      catalogue: exampleLearnCatalogue(),
      trackSlug: "first-mechanisms",
      problemSetSlug: "nowhere",
    },
  });
  expect(screen.getByRole("alert").textContent).toContain("not found");
});

function renderCheckpoint(): void {
  render(ProblemSetPage, {
    props: {
      catalogue: exampleLearnCatalogue(),
      trackSlug: "first-mechanisms",
      problemSetSlug: "first-checkpoint",
    },
  });
}

test("a checkpoint hides the names of reactions not yet done in it", () => {
  writeProgress(
    browserStorage,
    withRun(emptyProgress(), {
      ...runOf(
        "sn2-hydroxide-bromomethane@1",
        "2026-12-01T09:00:00Z",
        [stepOf("firstTry")],
        "checkpoint",
      ),
      problemSetRef: "first-mechanisms/first-checkpoint",
    }),
  );
  renderCheckpoint();
  const items = within(screen.getByRole("list", { name: "Set items" })).getAllByRole("listitem");
  const itemTexts = items.map((item) => item.textContent);
  expect(itemTexts.some((text) => text.includes("Radical bromination"))).toBe(false);
  expect(itemTexts.some((text) => text.includes("Hidden reaction"))).toBe(true);
  expect(itemTexts.some((text) => text.includes("SN2 substitution"))).toBe(true);
  expect(screen.queryAllByRole("link", { name: /Radical|SN2/ })).toEqual([]);
});

test("a checkpoint is started on its own page, not from a link naming a reaction", () => {
  renderCheckpoint();
  expect(screen.getByRole("button", { name: /Start checkpoint/ })).toBeTruthy();
  expect(screen.queryByRole("link", { name: /Next up|Start:/ })).toBeNull();
});

test("each set item is a reaction card ending at a hidden product", () => {
  renderPolarSteps();
  const items = within(screen.getByRole("list", { name: "Set items" })).getAllByRole("listitem");
  for (const item of items) {
    expect(within(item).getByLabelText("Product hidden")).toBeTruthy();
    expect(item.querySelectorAll("svg.scheme-species").length).toBeGreaterThan(0);
  }
});
