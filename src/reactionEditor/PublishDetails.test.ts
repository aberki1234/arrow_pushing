// @vitest-environment jsdom
/** Component test for PublishDetails.svelte: the daily-puzzle box shows Create's suggestion. */
import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import { exampleReaction } from "../testSupport/reactionEdits.js";
import PublishDetails from "./PublishDetails.svelte";

function suggestionText(document: Record<string, unknown>): string {
  render(PublishDetails, { props: { document, apply: () => undefined } });
  return screen.getByText(/suggested:/).textContent;
}

test("suggests the daily puzzle for a reaction that makes or breaks a real bond", () => {
  expect(suggestionText(exampleReaction("sn2-hydroxide-bromomethane.json"))).toContain(
    "suggested: yes",
  );
});

test("suggests practice only for resonance or a plain proton transfer", () => {
  const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
  const [step] = sn2.steps as Record<string, unknown>[];
  const resonance = { ...sn2, steps: [{ ...step, canonicalArrows: ["lp O1 -> π O1-C2"] }] };
  expect(suggestionText(resonance)).toContain("suggested: no");
});
