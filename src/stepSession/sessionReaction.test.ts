/** Tests for sessionReaction.ts on the example reactions. */
import { expect, test } from "vitest";
import { formatCurvedArrow } from "../arrowNotation/curvedArrowNotation.js";
import { preferredArrowStepsFrom, stepsLeaving } from "./sessionReaction.js";
import { exampleSessionReaction } from "../testSupport/exampleSessions.js";

test("the reaction's facts, states and steps are read", () => {
  const reaction = exampleSessionReaction("sn2-hydroxide-bromomethane");
  expect(reaction.reactionSlug).toBe("sn2-hydroxide-bromomethane");
  expect(reaction.reactionVersion).toBe(1);
  expect(reaction.title).toBe("SN2 substitution");
  expect(reaction.startStateId).toBe("reactants");
  expect(reaction.spectatorMapNumbers).toEqual([4]);
  const start = reaction.stateIdToState.get("reactants");
  expect(start?.learnerPrompt).toBe("Draw the arrows for the single, concerted step.");
  expect(start?.hintTiers).toHaveLength(3);
  expect(start?.displayFields.caption).toBe("hydroxide + bromomethane");
  const [step] = reaction.steps;
  expect(step?.canonicalArrows.map(formatCurvedArrow)).toEqual([
    "lp O1 -> σ O1-C2",
    "σ C2-Br3 -> lp Br3",
  ]);
  expect(step?.explanationAfterStep).toMatch(/concerted/);
});

test("steps leaving a state come preferred first", () => {
  const reaction = exampleSessionReaction("wittig-methylenation-cyclohexanone");
  expect(stepsLeaving(reaction, "reactants").map((step) => step.stepKey)).toEqual([
    "cycloaddition",
    "betaine-formation",
  ]);
  expect(stepsLeaving(reaction, "products")).toEqual([]);
});

test("a change step is read with its caption", () => {
  const reaction = exampleSessionReaction("aldol-addition-base");
  const [change] = stepsLeaving(reaction, "enolate");
  expect(change?.stepKind).toBe("change");
  expect(change?.canonicalArrows).toEqual([]);
});

test("arrow steps left on the preferred route", () => {
  expect(preferredArrowStepsFrom(exampleSessionReaction("aldol-addition-base"), "reactants")).toBe(
    3,
  );
  expect(preferredArrowStepsFrom(exampleSessionReaction("aldol-addition-base"), "enolate")).toBe(2);
  const wittig = exampleSessionReaction("wittig-methylenation-cyclohexanone");
  expect(preferredArrowStepsFrom(wittig, "reactants")).toBe(2);
  expect(preferredArrowStepsFrom(wittig, "betaine")).toBe(2);
  expect(preferredArrowStepsFrom(wittig, "products")).toBe(0);
});

test("abbreviated groups are read; reactions without any have none", () => {
  const wittig = exampleSessionReaction("wittig-methylenation-cyclohexanone");
  expect(wittig.abbreviatedGroups.map((group) => group.attachmentMapNumber)).toEqual([11, 21, 31]);
  expect(wittig.abbreviatedGroups[0]).toEqual({
    groupLabel: "Ph",
    attachmentMapNumber: 11,
    mapNumbers: [11, 12, 13, 14, 15, 16],
  });
  expect(exampleSessionReaction("sn2-hydroxide-bromomethane").abbreviatedGroups).toEqual([]);
});

test("the attribution is read: authors, licence and references", () => {
  const reaction = exampleSessionReaction("sn2-hydroxide-bromomethane");
  expect(reaction.authors.length).toBeGreaterThan(0);
  expect(reaction.authors[0]?.name).toBeTruthy();
  expect(reaction.licence).toBe("CC-BY-SA-4.0");
  expect(reaction.references.length).toBeGreaterThan(0);
});
