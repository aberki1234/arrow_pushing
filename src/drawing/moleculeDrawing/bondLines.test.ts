/** Tests for bondLines.ts. */
import { expect, test } from "vitest";
import { LABEL_CLEARANCE_PIXELS, MULTIPLE_BOND_SPACING_PIXELS, bondLines } from "./bondLines.js";

const FIRST = { x: 0, y: 0 };
const SECOND = { x: 100, y: 0 };

test("a single bond is one line cut short at both labels", () => {
  const drawn = bondLines(FIRST, SECOND, 1);
  expect(drawn.lines).toEqual([
    { start: { x: LABEL_CLEARANCE_PIXELS, y: 0 }, end: { x: 100 - LABEL_CLEARANCE_PIXELS, y: 0 } },
  ]);
  expect(drawn.midpoint).toEqual({ x: 50, y: 0 });
  expect(drawn.wedge).toBeNull();
});

test("a double bond is two lines either side of the centre", () => {
  const offsets = bondLines(FIRST, SECOND, 2).lines.map((line) => line.start.y);
  expect(offsets.map((offset) => Math.abs(offset))).toEqual([
    MULTIPLE_BOND_SPACING_PIXELS / 2,
    MULTIPLE_BOND_SPACING_PIXELS / 2,
  ]);
  expect(Math.sign(offsets[0] ?? 0)).toBe(-Math.sign(offsets[1] ?? 0));
});

test("a triple bond is the centre line and one either side", () => {
  const offsets = bondLines(FIRST, SECOND, 3).lines.map((line) => Math.abs(line.start.y));
  expect(offsets).toEqual([0, MULTIPLE_BOND_SPACING_PIXELS, MULTIPLE_BOND_SPACING_PIXELS]);
});

test("a wedge has no lines and a narrow end at the first atom", () => {
  const drawn = bondLines(FIRST, SECOND, 1, "wedge");
  expect(drawn.lines).toEqual([]);
  expect(drawn.wedge?.style).toBe("wedge");
  const corners = drawn.wedge?.corners ?? [];
  expect(corners).toHaveLength(3);
  expect(corners[0]).toEqual({ x: LABEL_CLEARANCE_PIXELS, y: 0 });
  expect(Math.abs((corners[1]?.y ?? 0) - (corners[2]?.y ?? 0))).toBeGreaterThan(4);
});

test("a dash is drawn as hash lines across the bond, widening towards the second atom", () => {
  const drawn = bondLines(FIRST, SECOND, 1, "dash");
  expect(drawn.lines).toEqual([]);
  expect(drawn.wedge?.style).toBe("dash");
  const hashes = drawn.wedge?.hashes ?? [];
  expect(hashes.length).toBeGreaterThanOrEqual(5);
  const halfWidths = hashes.map((hash) => Math.abs(hash.end.y - hash.start.y) / 2);
  for (const [position, hash] of hashes.entries()) {
    // Across the bond (it runs along x), inside the label clearances, each wider than the last.
    expect(hash.start.x).toBeCloseTo(hash.end.x);
    expect(hash.start.x).toBeGreaterThanOrEqual(LABEL_CLEARANCE_PIXELS);
    expect(hash.start.x).toBeLessThanOrEqual(100 - LABEL_CLEARANCE_PIXELS);
    if (position > 0) {
      expect(halfWidths[position] ?? 0).toBeGreaterThan(halfWidths[position - 1] ?? 0);
    }
  }
  expect(bondLines(FIRST, SECOND, 1, "wedge").wedge?.hashes).toEqual([]);
});

test("a wedge style on a double bond is ignored", () => {
  expect(bondLines(FIRST, SECOND, 2, "dash").wedge).toBeNull();
});
