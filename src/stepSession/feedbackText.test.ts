/** Tests for feedbackText.ts. */
import { expect, test } from "vitest";
import { feedbackForAssessment } from "./feedbackText.js";

test("correct shows the explanation; an accepted route and a resonance form say so", () => {
  const preferred = feedbackForAssessment(
    {
      assessmentKind: "correct",
      stepKey: "s",
      routePreference: "preferred",
      isDifferentDrawing: false,
    },
    "Backside attack.",
  );
  expect(preferred.feedbackTone).toBe("good");
  expect(preferred.heading).toBe("Correct");
  expect(preferred.paragraphs).toEqual(["Backside attack."]);
  const accepted = feedbackForAssessment(
    {
      assessmentKind: "correct",
      stepKey: "s",
      routePreference: "accepted",
      isDifferentDrawing: true,
    },
    "Via the betaine.",
  );
  expect(accepted.paragraphs.join(" ")).toMatch(/accepted route/);
  expect(accepted.paragraphs.join(" ")).toMatch(/resonance form/);
  expect(accepted.paragraphs.at(-1)).toBe("Via the betaine.");
});

test("a misconception shows its message with the tone of its severity", () => {
  const wrong = feedbackForAssessment({
    assessmentKind: "misconception",
    misconceptionId: "m",
    misconceptionTag: null,
    severity: "wrong",
    feedbackMessage: "Both repel.",
  });
  expect(wrong).toEqual({
    feedbackTone: "wrong",
    heading: "Not quite",
    paragraphs: ["Both repel."],
  });
  const plausible = feedbackForAssessment({
    assessmentKind: "misconception",
    misconceptionId: "m",
    misconceptionTag: null,
    severity: "plausible",
    feedbackMessage: "Possible, but not favoured.",
  });
  expect(plausible.feedbackTone).toBe("plausible");
});

test("partial progress shows the count, the authored message and any broken rule", () => {
  const partial = feedbackForAssessment({
    assessmentKind: "partialProgress",
    arrowsStillMissing: 1,
    authoredMessage: "Octet check.",
    brokenRuleId: "octet-exceeded",
    brokenRuleMessage: '"lp O1 -> σ O1-C2": C2 would have 10 valence-shell electrons (at most 8)',
  });
  expect(partial.feedbackTone).toBe("partial");
  expect(partial.heading).toBe("Right so far");
  expect(partial.paragraphs).toEqual([
    "1 more arrow to go.",
    "Octet check.",
    "But: C2 would have 10 valence-shell electrons (at most 8).",
  ]);
  const plural = feedbackForAssessment({
    assessmentKind: "partialProgress",
    arrowsStillMissing: 2,
    authoredMessage: null,
    brokenRuleId: null,
    brokenRuleMessage: null,
  });
  expect(plural.paragraphs).toEqual(["2 more arrows to go."]);
});

test("a generic rule gets a plain heading and its message without the arrow notation", () => {
  const rule = feedbackForAssessment({
    assessmentKind: "genericRule",
    genericRuleId: "no-electrons-at-source",
    message: '"lp C2 -> σ C2-O1": there are no such electrons to move',
  });
  expect(rule.feedbackTone).toBe("wrong");
  expect(rule.heading).toBe("No electrons there");
  expect(rule.paragraphs).toEqual(["There are no such electrons to move."]);
  const unknown = feedbackForAssessment({
    assessmentKind: "genericRule",
    genericRuleId: "some-new-rule",
    message: "Something.",
  });
  expect(unknown.heading).toBe("Not quite");
});

test("minor resonance form is partial progress in tone", () => {
  const minor = feedbackForAssessment({
    assessmentKind: "genericRule",
    genericRuleId: "minor-resonance-form",
    message: "This is a charge-separated resonance form.",
  });
  expect(minor.feedbackTone).toBe("partial");
});

test("wrong", () => {
  const wrong = feedbackForAssessment({ assessmentKind: "wrong" });
  expect(wrong.feedbackTone).toBe("wrong");
  expect(wrong.heading).toBe("Not this step");
});
