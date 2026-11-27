/** Tests for learnerPreview.ts: "Play as learner" on the unsaved draft. */
import { describe, expect, it } from "vitest";
import { exampleReaction } from "../../testSupport/reactionEdits.js";
import { previewReadiness, startPreview } from "./learnerPreview.js";
import { newReactionDraft } from "./reactionDraft.js";

const wittig = exampleReaction("wittig-methylenation-cyclohexanone.json");

describe("previewReadiness", () => {
  it("is ready when every step reproduces its to-state", () => {
    expect(previewReadiness(wittig)).toEqual({ ready: true });
  });

  it("is not ready without any step", () => {
    const draft = newReactionDraft({
      reactionSlug: "test",
      title: "Test",
      startState: { mappedSmiles: "[OH-:1]", mapNumberToCoordinates: { "1": [0, 0] } },
    });
    expect(previewReadiness(draft)).toEqual({
      ready: false,
      reason: "Draw a first step to play it.",
    });
  });

  it("is not ready, and says which step, when a step does not reproduce", () => {
    const steps = (wittig.steps as Record<string, unknown>[]).map((step) =>
      step.stepKey === "ring-closure" ? { ...step, canonicalArrows: ["lp O4 -> σ O4-C2"] } : step,
    );
    const readiness = previewReadiness({ ...wittig, steps });
    expect(readiness.ready).toBe(false);
    expect(!readiness.ready && readiness.reason).toContain('step "ring-closure"');
  });
});

describe("startPreview", () => {
  it("starts a practice session at the start state, or at a chosen state", () => {
    const fromStart = startPreview(wittig);
    expect(fromStart.mode).toBe("practice");
    expect(fromStart.currentStateId).toBe("reactants");
    expect(startPreview(wittig, "betaine").currentStateId).toBe("betaine");
  });
});
