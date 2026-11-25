/** Tests for reactionSlugs.ts: the slug Create makes from a reaction's name. */
import { expect, it } from "vitest";
import { slugFromTitle } from "./reactionSlugs.js";

it.each([
  ["SN2 of bromomethane", "sn2-of-bromomethane"],
  ["  Wittig   reaction ", "wittig-reaction"],
  ["Diels–Alder (endo)", "diels-alder-endo"],
  ["SN₂ on CH₃Br", "sn2-on-ch3br"],
  ["Café crème aldol", "cafe-creme-aldol"],
  ["α-Alkylation of a β-keto ester", "alpha-alkylation-of-a-beta-keto-ester"],
  ["→ ⇌ !", "reaction"],
])("makes %j into %j", (title, slug) => {
  expect(slugFromTitle(title, [])).toBe(slug);
});

it("adds the first free number when the slug is taken", () => {
  expect(slugFromTitle("SN2", ["sn2"])).toBe("sn2-2");
  expect(slugFromTitle("SN2", ["sn2", "sn2-2", "sn2-4"])).toBe("sn2-3");
  expect(slugFromTitle("SN2", ["sn2-2"])).toBe("sn2");
});
