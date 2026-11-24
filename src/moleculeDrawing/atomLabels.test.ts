/** Tests for atomLabels.ts. */
import { expect, test } from "vitest";
import { atomLabelText, plainLabel } from "./atomLabels.js";

const LEFT = Math.PI;
const RIGHT = 0;

test("implicit hydrogens go on the side away from the bonds", () => {
  expect(plainLabel(atomLabelText("O", 1, 0, [LEFT]))).toBe("OH");
  expect(plainLabel(atomLabelText("O", 1, 0, [RIGHT]))).toBe("HO");
  expect(atomLabelText("N", 2, 0, [RIGHT]).hydrogenSide).toBe("left");
});

test("hydrogen counts are subscripts and charges use a real minus sign", () => {
  expect(plainLabel(atomLabelText("C", 3, 0, [LEFT]))).toBe("CH₃");
  expect(plainLabel(atomLabelText("O", 1, -1, []))).toBe("OH−");
  expect(plainLabel(atomLabelText("O", 2, 0, []))).toBe("OH₂");
  expect(atomLabelText("O", 1, -1, []).chargeText).toBe("−");
  expect(atomLabelText("P", 0, 1, [LEFT, RIGHT]).chargeText).toBe("+");
  expect(atomLabelText("O", 0, -2, []).chargeText).toBe("2−");
  expect(atomLabelText("N", 0, 2, []).chargeText).toBe("2+");
});

test("an atom without hydrogens is just its element", () => {
  const label = atomLabelText("Br", 0, 0, [RIGHT]);
  expect(label.hydrogenText).toBe("");
  expect(plainLabel(label)).toBe("Br");
});

test("with no bonds the hydrogens go on the right", () => {
  expect(atomLabelText("C", 4, 0, []).hydrogenSide).toBe("right");
});

test("a vertical bond keeps the hydrogens on the right", () => {
  expect(atomLabelText("O", 1, 0, [Math.PI / 2]).hydrogenSide).toBe("right");
});
