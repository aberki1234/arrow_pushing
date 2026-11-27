/** Tests for lintRequests.ts: the core of the editor's lint worker. */
import { describe, expect, it } from "vitest";
import { loadChemistryToolkit } from "../../tooling/chemistryToolkit/chemistryToolkit.js";
import { exampleReaction } from "../../testSupport/reactionEdits.js";
import { lintRequestAnswerer } from "./lintRequests.js";

describe("lintRequestAnswerer", () => {
  const answer = lintRequestAnswerer(loadChemistryToolkit());

  it("answers each request with its id and the findings", async () => {
    const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
    expect(await answer({ requestId: 7, document: sn2 })).toEqual({
      requestId: 7,
      lintFindings: [],
    });
    const withoutPrompt = {
      ...sn2,
      stateIdToState: {
        ...(sn2.stateIdToState as object),
        reactants: {
          mappedSmiles: "[OH-:1].[CH3:2][Br:3].[Na+:4]",
          mapNumberToCoordinates: { "1": [0, 0], "2": [1, 0], "3": [2, 0], "4": [3, 0] },
        },
      },
    };
    const answered = await answer({ requestId: 8, document: withoutPrompt });
    expect(answered.lintFindings.map((found) => found.lintRuleId)).toContain(
      "learner-prompt-missing",
    );
  });

  it("reports a document the linter cannot read as one error finding", async () => {
    const answered = await answer({ requestId: 9, document: "not a reaction" });
    expect(answered.lintFindings).toEqual([
      {
        lintRuleId: "lint-failed",
        lintLevel: "error",
        instancePath: "",
        message: expect.any(String) as unknown,
      },
    ]);
  });
});
