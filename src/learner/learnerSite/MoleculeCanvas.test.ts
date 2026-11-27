// @vitest-environment jsdom
/**
 * Component test for MoleculeCanvas.svelte's point and snap (docs/SPEC.md §3, item 10g): with a
 * source picked, the possible new bonds are reachable by keyboard, drawn as faint dashed lines
 * once the drawing is touched, and a click picks the place (here, from the element clicked:
 * jsdom has no layout to measure the pointer against).
 */
import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import type { PickTarget } from "../../drawing/moleculeDrawing/stateDrawing.js";
import type { TappedPlace } from "../stepSession/arrowPicking.js";
import {
  checkArrows,
  continueToNextState,
  startStepSession,
  tapPlace,
} from "../stepSession/stepSession.js";
import { exampleSessionReaction } from "../../testSupport/exampleSessions.js";
import MoleculeCanvas from "./MoleculeCanvas.svelte";
import { currentStateDrawing, destinationsOf, drawingScaleOf } from "./stepScreenView.js";

const atom = (mapNumber: number): TappedPlace => ({ placeKind: "atom", mapNumber });
const lonePair = (mapNumber: number): TappedPlace => ({ placeKind: "lonePair", mapNumber });
const bond = (first: number, second: number): TappedPlace => ({
  placeKind: "bond",
  mapNumbers: [first, second],
});

/** The aldol's C–C bond step with the C3=C5 π bond picked as the source. */
function renderAldolWithSource(): PickTarget[] {
  let session = startStepSession(exampleSessionReaction("aldol-addition-base"));
  const firstStep = [lonePair(1), atom(4), bond(3, 4), atom(5), bond(5, 6), atom(6)];
  session = continueToNextState(
    continueToNextState(checkArrows(firstStep.reduce(tapPlace, session))),
  );
  session = tapPlace(session, bond(3, 5));
  const drawing = currentStateDrawing(session, drawingScaleOf(session.reaction));
  const picked: PickTarget[] = [];
  render(MoleculeCanvas, {
    props: {
      drawing,
      arrows: [],
      interactive: true,
      selectedTargetId: "bond:3-5",
      destinations: destinationsOf(session, drawing),
      onPick: (target: PickTarget) => {
        picked.push(target);
      },
    },
  });
  return picked;
}

test("a possible new bond is a keyboard target with its own name", async () => {
  const picked = renderAldolWithSource();
  const newBond = screen.getByRole("button", { name: "new bond C3–C9" });
  await fireEvent.keyDown(newBond, { key: "Enter" });
  expect(picked.map((target) => target.pickTargetId)).toEqual(["newBond:3-9"]);
});

test("touching the drawing shows the new bonds as faint dashed lines", async () => {
  renderAldolWithSource();
  expect(document.querySelectorAll(".new-bond-line.faint")).toHaveLength(0);
  const canvas = screen.getByRole("group");
  await fireEvent.pointerDown(canvas, { pointerType: "touch" });
  expect(document.querySelectorAll(".new-bond-line.faint").length).toBeGreaterThan(0);
});

test("a click on a place picks it", async () => {
  const picked = renderAldolWithSource();
  const newBond = screen.getByRole("button", { name: "new bond C3–C9" });
  await fireEvent.click(newBond);
  expect(picked.map((target) => target.pickTargetId)).toEqual(["newBond:3-9"]);
});

test("a click on a destination finishes the arrow and never also starts the next", async () => {
  let session = startStepSession(exampleSessionReaction("aldol-addition-base"));
  session = tapPlace(session, lonePair(1));
  const drawing = currentStateDrawing(session, drawingScaleOf(session.reaction));
  const picked: string[] = [];
  const rendered = render(MoleculeCanvas, {
    props: {
      drawing,
      arrows: [],
      interactive: true,
      selectedTargetId: null,
      destinations: destinationsOf(session, drawing),
      onPick: (target: PickTarget) => {
        picked.push(target.pickTargetId);
        // As the step screen does: the arrow is drawn, so no source is picked any more.
        void rendered.rerender({ destinations: null });
      },
    },
  });
  const h4 = screen.getByRole("button", { name: "H4" });
  await fireEvent.click(h4);
  expect(picked).toEqual(["atom:4"]);
});
