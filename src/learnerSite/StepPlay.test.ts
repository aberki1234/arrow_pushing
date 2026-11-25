// @vitest-environment jsdom
/**
 * A few component tests for the step screen (decided 2026-11-25: logic is tested in the pure
 * modules; these check the wiring): drawing arrows with the keyboard alone, checking, the
 * feedback panel, moving on, and Escape. Layout is checked by eye in a browser, not here.
 */
import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeAll, expect, test } from "vitest";
import type { StepSession } from "../stepSession/stepSession.js";
import { startStepSession } from "../stepSession/stepSession.js";
import { exampleSessionReaction } from "../testSupport/exampleSessions.js";
import StepPlay from "./StepPlay.svelte";

beforeAll(() => {
  // jsdom has neither matchMedia nor the Web Animations API: answer as a learner who prefers
  // reduced motion, so the cross-fade between states has no animation to run.
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => undefined,
    }) as unknown as MediaQueryList;
});

/** Render the screen; every update re-renders it with the new session, as StepScreen does. */
function renderSn2(): void {
  let session: StepSession = startStepSession(exampleSessionReaction("sn2-hydroxide-bromomethane"));
  const rendered = render(StepPlay, {
    props: {
      session,
      update: (next: StepSession) => {
        session = next;
        void rendered.rerender({ session });
      },
      heading: "SN2 substitution",
      subtitle: "",
    },
  });
}

async function pressEnterOn(accessibleName: string): Promise<void> {
  const [target] = screen.getAllByRole("button", { name: accessibleName });
  if (target === undefined) {
    throw new Error(`no pick target named ${accessibleName}`);
  }
  target.focus();
  await fireEvent.keyDown(target, { key: "Enter" });
}

test("arrows drawn with the keyboard alone are listed, checked and explained", async () => {
  renderSn2();
  await pressEnterOn("lone pair on O1");
  await pressEnterOn("C2");
  await pressEnterOn("bond C2–Br3");
  await pressEnterOn("Br3");
  const arrowList = screen.getByRole("list", { name: "Your arrows" });
  expect(arrowList.textContent).toContain("lone pair on O1 → new bond O1–C2");
  expect(arrowList.textContent).toContain("bond C2–Br3 → lone pair on Br3");
  await fireEvent.click(screen.getByRole("button", { name: "Check" }));
  expect(screen.getByRole("status").textContent).toContain("Correct");
  await fireEvent.click(screen.getByRole("button", { name: "Next step →" }));
  expect(screen.getByRole("status").textContent).toContain("Mechanism complete");
});

test("Escape drops a picked source", async () => {
  renderSn2();
  await pressEnterOn("lone pair on O1");
  expect(screen.getAllByRole("button", { name: "lone pair on O1", pressed: true })).toHaveLength(1);
  await fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryAllByRole("button", { name: "lone pair on O1", pressed: true })).toHaveLength(
    0,
  );
});

test("a refused tap is explained in the feedback panel", async () => {
  renderSn2();
  await pressEnterOn("C2");
  expect(screen.getByRole("status").textContent).toContain("Start from electrons");
});
