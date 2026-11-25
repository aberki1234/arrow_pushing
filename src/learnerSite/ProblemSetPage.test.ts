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
