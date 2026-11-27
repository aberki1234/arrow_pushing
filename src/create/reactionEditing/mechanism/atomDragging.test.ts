/** Tests for atomDragging.ts: a drag on screen moves one atom of one state. */
import { describe, expect, it } from "vitest";
import { exampleReaction } from "../../../testSupport/reactionEdits.js";
import { moveAtom } from "./atomDragging.js";
import { statesOf } from "../draft/reactionDraft.js";

const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
const coordinatesOf = (document: Readonly<Record<string, unknown>>, stateId: string): unknown =>
  (statesOf(document)[stateId] as { mapNumberToCoordinates: unknown }).mapNumberToCoordinates;

describe("moveAtom", () => {
  it("turns screen pixels into RDKit units, with y flipped, rounded to 0.01", () => {
    // 40 pixels per unit: 60 px right and 20 px down on screen is +1.5 x and -0.5 y.
    const moved = moveAtom(sn2, "reactants", 2, { deltaX: 60, deltaY: 20 }, 40);
    const before = coordinatesOf(sn2, "reactants") as Record<string, number[]>;
    const after = coordinatesOf(moved, "reactants") as Record<string, number[]>;
    expect(after["2"]).toEqual([(before["2"]?.[0] ?? 0) + 1.5, (before["2"]?.[1] ?? 0) - 0.5]);
    expect({ ...after, "2": null }).toEqual({ ...before, "2": null });
    expect(coordinatesOf(moved, "products")).toEqual(coordinatesOf(sn2, "products"));
  });

  it("rounds the new position to 0.01 units", () => {
    const moved = moveAtom(sn2, "reactants", 1, { deltaX: 1, deltaY: 0 }, 3);
    const [movedX = 0] = (coordinatesOf(moved, "reactants") as Record<string, number[]>)["1"] ?? [];
    expect(Math.round(movedX * 100) / 100).toBe(movedX);
  });

  it("leaves the document as it is for an unknown state or atom", () => {
    expect(moveAtom(sn2, "elsewhere", 2, { deltaX: 10, deltaY: 0 }, 40)).toBe(sn2);
    expect(moveAtom(sn2, "reactants", 99, { deltaX: 10, deltaY: 0 }, 40)).toBe(sn2);
  });
});
