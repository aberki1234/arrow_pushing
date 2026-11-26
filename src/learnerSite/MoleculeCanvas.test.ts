// @vitest-environment jsdom
/**
 * Component test for MoleculeCanvas.svelte's "which atom forms the bond?" menu: the drawing shows
 * no map numbers, so each candidate atom carries a badge (① ②) that the menu names, and the
 * option hovered or focused lights its atom's badge.
 */
import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import type { TappedPlace } from "../stepSession/arrowPicking.js";
import {
  checkArrows,
  continueToNextState,
  startStepSession,
  tapPlace,
} from "../stepSession/stepSession.js";
import { exampleSessionReaction } from "../testSupport/exampleSessions.js";
import MoleculeCanvas from "./MoleculeCanvas.svelte";
import { currentStateDrawing, destinationChoice, drawingScaleOf } from "./stepScreenView.js";

const atom = (mapNumber: number): TappedPlace => ({ placeKind: "atom", mapNumber });
const lonePair = (mapNumber: number): TappedPlace => ({ placeKind: "lonePair", mapNumber });
const bond = (first: number, second: number): TappedPlace => ({
  placeKind: "bond",
  mapNumbers: [first, second],
});

/** The aldol's C–C bond step with the C3=C5 π bond and C9 tapped: the menu is open. */
function renderAldolChoice(): void {
  let session = startStepSession(exampleSessionReaction("aldol-addition-base"));
  const firstStep = [lonePair(1), atom(4), bond(3, 4), atom(5), bond(5, 6), atom(6)];
  session = continueToNextState(
    continueToNextState(checkArrows(firstStep.reduce(tapPlace, session))),
  );
  session = [bond(3, 5), atom(9)].reduce(tapPlace, session);
  render(MoleculeCanvas, {
    props: {
      drawing: currentStateDrawing(session, drawingScaleOf(session.reaction)),
      arrows: [],
      interactive: true,
      selectedTargetId: null,
      choice: destinationChoice(session),
      onPick: () => undefined,
      onChoose: () => undefined,
      onCancelChoice: () => undefined,
    },
  });
}

test("each candidate atom carries the badge its menu option names", () => {
  renderAldolChoice();
  const badges = document.querySelectorAll(".choice-badge");
  expect([...badges].map((badge) => badge.textContent.trim())).toEqual(["①", "②"]);
  expect([...badges].map((badge) => badge.getAttribute("data-map-number"))).toEqual(["3", "5"]);
  const options = screen.getAllByRole("menuitem");
  expect(options.map((option) => option.textContent.trim())).toEqual([
    "① forms the bond",
    "② forms the bond",
  ]);
  expect(options[1]?.getAttribute("aria-label")).toBe("② (C5) forms the bond");
});

test("hovering or focusing an option lights its atom's badge", async () => {
  renderAldolChoice();
  const [firstOption, secondOption] = screen.getAllByRole("menuitem");
  const litBadges = (): string[] =>
    [...document.querySelectorAll(".choice-badge.lit")].map(
      (badge) => badge.getAttribute("data-map-number") ?? "",
    );
  // The first option has the focus when the menu opens.
  expect(litBadges()).toEqual(["3"]);
  if (secondOption === undefined || firstOption === undefined) {
    throw new Error("the menu has two options");
  }
  await fireEvent.mouseEnter(secondOption);
  expect(litBadges()).toEqual(["5"]);
  await fireEvent.focus(firstOption);
  expect(litBadges()).toEqual(["3"]);
});
