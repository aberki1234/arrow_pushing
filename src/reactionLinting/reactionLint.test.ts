/**
 * Tests for reactionLint.ts and the rule modules it runs.
 *
 * The four example reactions in fixtures/reactions must lint clean. Each case in
 * fixtures/lint_cases/reaction_edits.json edits one of them to break a rule, and names the rule
 * ids expected, worked out by hand from the rule definitions in docs/schema-design.md §3.5.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  type ChemistryToolkit,
  loadChemistryToolkit,
} from "../chemistryToolkit/chemistryToolkit.js";
import { exampleReactionDocuments } from "../testSupport/fixtureFiles.js";
import {
  applyReactionEdits,
  editedReaction,
  exampleReaction,
  reactionEditCases,
} from "../testSupport/reactionEdits.js";
import { lintReaction } from "./reactionLint.js";

const WARNING_RULE_IDS = new Set([
  "alternative-product-without-caption",
  "fewer-than-three-hint-tiers",
  "misconception-never-fires",
  "too-many-skeleton-symmetries",
  "misconception-in-abbreviated-group",
]);

let toolkit: ChemistryToolkit;

beforeAll(async () => {
  toolkit = await loadChemistryToolkit();
});

const editCases = reactionEditCases().map((editCase) => [editCase.caseName, editCase] as const);

function lintEdited(caseName: string): ReturnType<typeof lintReaction> {
  return lintReaction(editedReaction(caseName), toolkit);
}

it.each(exampleReactionDocuments())("finds nothing in the example %s", (name, document) => {
  expect(lintReaction(document, toolkit)).toEqual([]);
});

it.each(editCases)("%s: reports exactly the expected rules", (caseName, editCase) => {
  const edited = applyReactionEdits(exampleReaction(editCase.baseReactionFile), editCase.edits);
  const ruleIds = [...new Set(lintReaction(edited, toolkit).map((found) => found.lintRuleId))];
  expect(ruleIds.sort()).toEqual(editCase.expectedLintRuleIds);
});

it.each(editCases)("%s: the lint level follows the rule", (caseName, editCase) => {
  const edited = applyReactionEdits(exampleReaction(editCase.baseReactionFile), editCase.edits);
  for (const finding of lintReaction(edited, toolkit)) {
    expect(finding.lintLevel).toBe(WARNING_RULE_IDS.has(finding.lintRuleId) ? "warning" : "error");
  }
});

it("every rule except the symmetry cap is broken by at least one case", () => {
  // The symmetry cap is tested below with a small cap: no small molecule passes 10,000.
  const covered = new Set(reactionEditCases().flatMap((editCase) => editCase.expectedLintRuleIds));
  expect([...covered].sort()).toEqual(
    [
      "schema-violation",
      "state-atoms-inconsistent",
      "mapped-smiles-not-supported",
      "step-state-id-unknown",
      "duplicate-step-key",
      "state-unreachable",
      "mechanism-has-cycle",
      "alternative-product-without-caption",
      "several-preferred-steps-leave-state",
      "preferred-route-does-not-reach-product",
      "change-step-not-alone",
      "leaving-steps-reach-equivalent-states",
      "step-does-not-reproduce-to-state",
      "misconception-pattern-invalid",
      "duplicate-misconception-id",
      "misconception-hides-correct-answer",
      "misconception-never-fires",
      "learner-prompt-missing",
      "hint-tiers-missing",
      "fewer-than-three-hint-tiers",
      "abbreviated-group-atoms-unknown",
      "abbreviated-group-not-attached-once",
      "arrow-touches-abbreviated-group",
      "misconception-in-abbreviated-group",
    ].sort(),
  );
});

describe("where findings point and what they say", () => {
  it.each([
    ["step to an unknown state", ["/steps/0/toStateId"]],
    ["canonical arrows break the octet", ["/steps/0/canonicalArrows"]],
    ["partial arrow set is not a complete step", ["/steps/0/partialArrowSets/0"]],
    ["change step adds the wrong molecule", ["/steps/1"]],
    ["two steps share a step key", ["/steps/1/stepKey"]],
    ["misconception matches the canonical arrows", ["/stateIdToState/reactants/misconceptions/0"]],
    [
      "misconception covered by an earlier wider one",
      ["/stateIdToState/reactants/misconceptions/1"],
    ],
    ["one hint tier only", ["/stateIdToState/reactants/hintTiers"]],
    ["no learner prompt where arrows are drawn", ["/stateIdToState/reactants"]],
    ["branch state no longer reachable", ["/stateIdToState/betaine"]],
    ["both Wittig routes preferred", ["/steps/1/routePreference"]],
    ["two leaving steps reach the same state drawn twice", ["/steps/4"]],
    ["abbreviated group names an unknown atom", ["/abbreviatedGroups/0"]],
    ["abbreviated ring missing one atom is attached by three bonds", ["/abbreviatedGroups/0"]],
    ["canonical arrows use an abbreviated atom", ["/steps/0/canonicalArrows"]],
    [
      "misconception names an abbreviated atom",
      ["/stateIdToState/enolate-and-aldehyde/misconceptions/2"],
    ],
  ])("%s", (caseName, expectedInstancePaths) => {
    expect(lintEdited(caseName).map((found) => found.instancePath)).toEqual(expectedInstancePaths);
  });

  it("a schema violation carries the schema path", () => {
    const findings = lintEdited("schema violation stops the lint");
    expect(findings.map((found) => [found.lintRuleId, found.instancePath])).toEqual([
      ["schema-violation", ""],
    ]);
  });

  it("the message says which rule the canonical arrows break", () => {
    const message = lintEdited("canonical arrows break the octet")[0]?.message ?? "";
    expect(message).toContain("C2");
    expect(message).toContain("10");
  });

  it("the message says a resonance form is not the drawing", () => {
    const findings = lintEdited("canonical arrows give a resonance form, not the drawing");
    expect(findings[0]?.message).toContain("resonance form");
  });
});

it("the symmetry cap warns on each state where arrows are drawn", () => {
  // The Wittig reactants have 96 skeleton symmetries (3! orders of the phenyls x 2^3 ring flips
  // x 2 cyclohexanone flips; build item 4); betaine and oxaphosphetane keep them. A cap of 50 is
  // passed by all three; the product state has no arrow step leaving it, so it is not checked.
  const wittig = exampleReaction("wittig-methylenation-cyclohexanone.json");
  const findings = lintReaction(wittig, toolkit, 50);
  expect(new Set(findings.map((found) => found.lintRuleId))).toEqual(
    new Set(["too-many-skeleton-symmetries"]),
  );
  expect(findings.map((found) => found.instancePath).sort()).toEqual([
    "/stateIdToState/betaine/mappedSmiles",
    "/stateIdToState/oxaphosphetane/mappedSmiles",
    "/stateIdToState/reactants/mappedSmiles",
  ]);
});
