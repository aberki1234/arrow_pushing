// @vitest-environment jsdom
/**
 * Component tests for the Progress page (revised 2026-11-26): a "Practise next" card with the
 * learner's weakest reactions in place of the Tracks section and the reaction library. The
 * choice itself is tested in src/learnerStatistics/practiseNext.test.ts.
 */
import { render, screen, within } from "@testing-library/svelte";
import { beforeEach, expect, test } from "vitest";
import {
  PROGRESS_STORAGE_KEY,
  emptyProgress,
  withRun,
  writeProgress,
} from "../learnerProgress/learnerProgress.js";
import { runOf, stepOf } from "../testSupport/progressExamples.js";
import { exampleLearnCatalogue } from "../testSupport/trackEdits.js";
import { browserStorage } from "./browserStorage.js";
import ProgressPage from "./ProgressPage.svelte";

beforeEach(() => {
  browserStorage.removeItem(PROGRESS_STORAGE_KEY);
});

function practiseNextCard(): HTMLElement {
  const card = screen.getByRole("heading", { name: "Practise next" }).closest("section");
  if (card === null) {
    throw new Error("no Practise next card");
  }
  return card;
}

test("the weakest reaction tried is offered with its mastery and a Practise link", () => {
  writeProgress(
    browserStorage,
    withRun(
      emptyProgress(),
      runOf("sn2-hydroxide-bromomethane@1", "2026-12-01T09:00:00Z", [stepOf("afterRetry")]),
    ),
  );
  render(ProgressPage, { props: { catalogue: exampleLearnCatalogue() } });
  const card = practiseNextCard();
  expect(card.textContent).toContain("SN2 substitution");
  expect(card.textContent).toContain("67%");
  expect(
    within(card)
      .getByRole("link", { name: /Practise/ })
      .getAttribute("href"),
  ).toBe("#/play/sn2-hydroxide-bromomethane@1");
});

test("with nothing to practise the card says so", () => {
  render(ProgressPage, { props: { catalogue: exampleLearnCatalogue() } });
  expect(practiseNextCard().textContent).toContain("Finish a reaction");
});

test("the Tracks section and the reaction library are gone", () => {
  render(ProgressPage, { props: { catalogue: exampleLearnCatalogue() } });
  expect(screen.queryByRole("heading", { name: "Tracks" })).toBeNull();
  expect(screen.queryByRole("heading", { name: /Reaction library/ })).toBeNull();
});
