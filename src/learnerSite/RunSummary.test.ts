// @vitest-environment jsdom
/**
 * Component tests for the finished view (item 11): a daily result is the tiles and its points in
 * ordinary text, with no share text and no Copy button.
 */
import { render, screen, within } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { expect, test } from "vitest";
import { exampleSessionReaction } from "../testSupport/exampleSessions.js";
import { stepOf } from "../testSupport/progressExamples.js";
import RunSummary from "./RunSummary.svelte";

const NO_ACTIONS = createRawSnippet(() => ({ render: (): string => "<span></span>" }));

function renderDailySummary(): HTMLElement {
  const { container } = render(RunSummary, {
    props: {
      reaction: exampleSessionReaction("aldol-addition-base"),
      stepResults: [stepOf("afterRetry"), stepOf("firstTry")],
      daily: { puzzleNumber: 2, streak: 3 },
      extras: null,
      actions: NO_ACTIONS,
    },
  });
  return container;
}

test("a daily result is its tiles and its points in ordinary text", () => {
  const container = renderDailySummary();
  const tiles = within(screen.getByRole("list", { name: "Steps" })).getAllByRole("listitem");
  expect(tiles.map((tile) => tile.textContent.trim())).toEqual(["~", "✓"]);
  const points = screen.getByText(/5 \/ 6 points/);
  expect(points.closest("b, strong")).toBeNull();
  expect(container.textContent).toContain("3-day streak");
});

test("there is no share text and no Copy button", () => {
  const container = renderDailySummary();
  expect(container.textContent).not.toContain("ArrowPush");
  expect(screen.queryByRole("button", { name: /Copy/ })).toBeNull();
});
