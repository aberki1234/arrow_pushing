/**
 * Tests for arrowPatternCoverage.ts.
 *
 * Each expectation follows from the matching rules in attemptAssessment/arrowPatterns.ts: a wider
 * pattern covers a narrower one only if every arrow set matching the narrower one also matches the
 * wider one. Cases where that holds but the test cannot prove it (a bare atom against a bond
 * destination) are expected false: the test is sound, not complete.
 */
import { expect, it } from "vitest";
import { parseArrowPattern } from "../../../core/attemptAssessment/arrowPatterns.js";
import { arrowPatternCovers } from "./arrowPatternCoverage.js";

const ROLES = { nucleophile: [1], halogens: [3, 5] };

it.each([
  ["lp O1 -> Br3", "lp O1 -> Br3", true], // the same pattern
  ["lp O1 -> Br3", "lp O1 -> Br3; σ C2-Br3 -> lp Br3", true], // fewer arrows required
  ["lp O1 -> Br3; σ C2-Br3 -> lp Br3", "lp O1 -> Br3", false], // more arrows required
  ["lp O* -> Br3", "lp O1 -> Br3", true], // any O covers O1
  ["lp O1 -> Br3", "lp O* -> Br3", false],
  ["lp * -> Br3", "lp @nucleophile -> Br3", true],
  ["lp O* -> Br3", "lp @nucleophile -> Br3", false], // a role's element is unknown
  ["lp @nucleophile -> Br3", "lp O1 -> Br3", true], // role {1} covers map number 1
  ["lp O1 -> @halogens", "lp O1 -> Br3", true],
  ["lp O1 -> Br3", "lp O1 -> @halogens", false],
  ["* *> Br3", "lp O1 -> Br3", true], // "*>" covers both arrow types
  ["lp O1 -> Br3", "lp O1 *> Br3", false],
  ["lp O1 ~> Br3", "lp O1 -> Br3", false],
  ["bond C2-Br3 -> lp Br3", "σ Br3-C2 -> lp Br3", true], // bond atoms in either order
  ["σ C2-Br3 -> lp Br3", "bond C2-Br3 -> lp Br3", false],
  ["* C2-Br3 -> lp Br3", "π C2-Br3 -> lp Br3", true],
  ["* O1 -> Br3", "rad O1 -> Br3", true],
  ["* O1 -> Br3", "σ O1-C2 -> Br3", false],
  ["lp O1 -> Br3", "lp O1 -> lp Br3", true], // bare atom covers lp on it
  ["lp O1 -> Br3", "lp O1 -> σ O1-Br3", false], // bond destination: not proved
  ["lp O1 -> lp Br3", "lp O1 -> Br3", false], // bare atom also means bonds
  ["lp O1 -> *", "lp O1 -> Br3", true], // a lone "*" covers everything
  ["lp O1 -> *", "lp O1 -> σ O1-C2", true],
])("%s covers %s: %s", (widerText, narrowerText, expectedCovers) => {
  const wider = parseArrowPattern(widerText, ROLES);
  const narrower = parseArrowPattern(narrowerText, ROLES);
  expect(arrowPatternCovers(wider, narrower)).toBe(expectedCovers);
});
