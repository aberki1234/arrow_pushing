/**
 * Tests for choiceMenuLayout.ts: where the "which atom forms the bond?" badges and menu go, so
 * that neither hides the atoms the learner is choosing between.
 */
import { describe, expect, test } from "vitest";
import { choiceBadgePoint, choiceMenuOrigin } from "./choiceMenuLayout.js";
import type { Point } from "./planeGeometry.js";
import type { DrawnAtom, StateDrawing } from "./stateDrawing.js";

function drawnAtom(
  mapNumber: number,
  point: Point,
  hydrogenText = "",
  hydrogenSide = "right",
): DrawnAtom {
  return {
    mapNumber,
    element: "C",
    point,
    labelText: { element: "C", hydrogenText, hydrogenSide, chargeText: "" },
    isSpectator: false,
  } as unknown as DrawnAtom;
}

/** H₂C3=C5 going up to the right, C5 bonded on to O6 down to the right; C9 far up-left. */
function enolateDrawing(): StateDrawing {
  const atoms = [
    drawnAtom(3, { x: 100, y: 200 }, "H₂", "left"),
    drawnAtom(5, { x: 148, y: 172 }),
    drawnAtom(6, { x: 196, y: 200 }),
    drawnAtom(9, { x: 40, y: 110 }),
  ];
  const bonds = [
    { mapNumbers: [3, 5], bondOrder: 2 },
    { mapNumbers: [5, 6], bondOrder: 1 },
  ];
  return { atoms, bonds, electronDots: [] } as unknown as StateDrawing;
}

const distance = (first: Point, second: Point): number =>
  Math.hypot(first.x - second.x, first.y - second.y);

describe("badges", () => {
  test("a badge sits clear of its atom's label, its bonds and the other atoms", () => {
    const drawing = enolateDrawing();
    for (const mapNumber of [3, 5]) {
      const badge = choiceBadgePoint(drawing, mapNumber);
      const own = drawing.atoms.find((atom) => atom.mapNumber === mapNumber)?.point ?? badge;
      expect(distance(badge, own)).toBeGreaterThan(15);
      expect(distance(badge, own)).toBeLessThan(30);
      for (const atom of drawing.atoms) {
        expect(distance(badge, atom.point)).toBeGreaterThan(15);
      }
    }
    // H₂ is written on the left of C3: its badge does not go there.
    expect(choiceBadgePoint(drawing, 3).x).toBeGreaterThanOrEqual(100 - 15);
  });
});

describe("the menu", () => {
  test("opens beside the tapped atom, on a side that covers neither candidate atom", () => {
    const drawing = enolateDrawing();
    const size = { width: 162, height: 74 };
    const keepClear = [3, 5].flatMap((mapNumber) => [
      drawing.atoms.find((atom) => atom.mapNumber === mapNumber)?.point ?? { x: 0, y: 0 },
      choiceBadgePoint(drawing, mapNumber),
    ]);
    const origin = choiceMenuOrigin(drawing, 9, keepClear, size);
    for (const point of keepClear) {
      const inside =
        point.x >= origin.x - 10 &&
        point.x <= origin.x + size.width + 10 &&
        point.y >= origin.y - 10 &&
        point.y <= origin.y + size.height + 10;
      expect(inside, `${String(point.x)},${String(point.y)}`).toBe(false);
    }
    expect(distance(origin, { x: 40, y: 110 })).toBeLessThan(size.width + 40);
  });
});
