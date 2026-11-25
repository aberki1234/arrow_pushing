/** Tests for stepDeletion.ts: a step goes, with every state no route reaches any more. */
import { describe, expect, it } from "vitest";
import { exampleReaction } from "../testSupport/reactionEdits.js";
import { statesOf, stepsOf } from "./reactionDraft.js";
import { deleteStep, statesLeftUnreachable } from "./stepDeletion.js";

const wittig = exampleReaction("wittig-methylenation-cyclohexanone.json");
const stateIds = (document: Readonly<Record<string, unknown>>): string[] =>
  Object.keys(statesOf(document));
const stepKeys = (document: Readonly<Record<string, unknown>>): string[] =>
  stepsOf(document).map((step) => String(step.stepKey));

describe("deleteStep", () => {
  it.each([
    ["betaine-formation", ["betaine"], ["cycloaddition", "retro-cycloaddition"]],
    ["cycloaddition", [], ["betaine-formation", "ring-closure", "retro-cycloaddition"]],
    ["retro-cycloaddition", ["products"], ["cycloaddition", "betaine-formation", "ring-closure"]],
  ])(
    "deleting %s removes states %j and keeps steps %j",
    (stepKey, removedStateIds, keptStepKeys) => {
      expect(statesLeftUnreachable(wittig, stepKey)).toEqual(removedStateIds);
      const deletion = deleteStep(wittig, stepKey);
      if (deletion.outcome !== "deleted") {
        throw new Error(deletion.reason);
      }
      expect(deletion.removedStateIds).toEqual(removedStateIds);
      expect(stepKeys(deletion.document)).toEqual(keptStepKeys);
      expect(stateIds(deletion.document)).toEqual(
        stateIds(wittig).filter((stateId) => !removedStateIds.includes(stateId)),
      );
    },
  );

  it("removes a whole chain past the deleted step", () => {
    const aldol = exampleReaction("aldol-addition-base.json");
    const deletion = deleteStep(aldol, "enolate-formation");
    expect(deletion.outcome === "deleted" && deletion.removedStateIds).toEqual([
      "enolate",
      "enolate-and-aldehyde",
      "alkoxide",
      "aldol-product",
    ]);
    expect(deletion.outcome === "deleted" && stepKeys(deletion.document)).toEqual([]);
  });

  it("refuses a step key that does not exist", () => {
    const deletion = deleteStep(wittig, "no-such-step");
    expect(deletion.outcome === "refused" && deletion.reason).toContain('no step "no-such-step"');
  });
});
