/**
 * What the feedback panel says about an attempt assessment: a tone (its colour and icon), a
 * heading and paragraphs, in the order of docs/schema-design.md section 5.1.
 */
import type { AttemptAssessment } from "../attemptAssessment/attemptAssessment.js";

export type FeedbackTone = "neutral" | "good" | "partial" | "plausible" | "wrong";

export interface FeedbackText {
  readonly feedbackTone: FeedbackTone;
  readonly heading: string;
  readonly paragraphs: readonly string[];
}

const GENERIC_RULE_ID_TO_HEADING: Readonly<Record<string, string>> = {
  "atom-not-in-state": "That atom isn't here",
  "destination-not-adjacent-to-source": "Electrons move to a neighbouring place",
  "no-electrons-at-source": "No electrons there",
  "destination-bond-already-exists": "Those atoms are already bonded",
  "destination-bond-missing": "There is no bond there",
  "fish-hook-to-lone-pair": "One electron can't make a lone pair",
  "odd-electrons-in-bond": "Half a bond",
  "bond-order-above-three": "Too many bonds",
  "octet-exceeded": "Too many electrons",
  "wrong-arrow-type": "Wrong kind of arrow",
  "redundant-arrow": "Some arrows cancel out",
  "minor-resonance-form": "Nearly: a charge-separated form",
  "reversed-flow": "An arrow points the wrong way",
};

/** A rule message without its leading arrow notation, as a sentence. */
function learnerSentence(message: string): string {
  const withoutNotation = message.replace(/^"[^"]*": /, "");
  const capitalised = withoutNotation.charAt(0).toUpperCase() + withoutNotation.slice(1);
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`;
}

function partialProgressParagraphs(
  arrowsStillMissing: number | null,
  authoredMessage: string | null,
  brokenRuleMessage: string | null,
): string[] {
  const paragraphs: string[] = [];
  if (arrowsStillMissing !== null) {
    const noun = arrowsStillMissing === 1 ? "arrow" : "arrows";
    paragraphs.push(`${String(arrowsStillMissing)} more ${noun} to go.`);
  }
  if (authoredMessage !== null) {
    paragraphs.push(authoredMessage);
  }
  if (brokenRuleMessage !== null) {
    paragraphs.push(`But: ${learnerSentence(brokenRuleMessage)}`);
  }
  return paragraphs;
}

function correctFeedback(
  assessment: Extract<AttemptAssessment, { assessmentKind: "correct" }>,
  explanationAfterStep: string,
): FeedbackText {
  const paragraphs: string[] = [];
  if (assessment.routePreference === "accepted") {
    paragraphs.push("This is an accepted route; the hints follow the textbook one.");
  }
  if (assessment.isDifferentDrawing) {
    paragraphs.push("You drew a resonance form of the result; it is shown in its usual drawing.");
  }
  if (explanationAfterStep !== "") {
    paragraphs.push(explanationAfterStep);
  }
  return { feedbackTone: "good", heading: "Correct", paragraphs };
}

function misconceptionFeedback(
  assessment: Extract<AttemptAssessment, { assessmentKind: "misconception" }>,
): FeedbackText {
  return assessment.severity === "plausible"
    ? {
        feedbackTone: "plausible",
        heading: "Plausible, but not this route",
        paragraphs: [assessment.feedbackMessage],
      }
    : { feedbackTone: "wrong", heading: "Not quite", paragraphs: [assessment.feedbackMessage] };
}

/** `explanationAfterStep` is shown under a correct assessment. */
export function feedbackForAssessment(
  assessment: AttemptAssessment,
  explanationAfterStep = "",
): FeedbackText {
  switch (assessment.assessmentKind) {
    case "correct":
      return correctFeedback(assessment, explanationAfterStep);
    case "misconception":
      return misconceptionFeedback(assessment);
    case "partialProgress":
      return {
        feedbackTone: "partial",
        heading: "Right so far",
        paragraphs: partialProgressParagraphs(
          assessment.arrowsStillMissing,
          assessment.authoredMessage,
          assessment.brokenRuleMessage,
        ),
      };
    case "genericRule":
      return {
        feedbackTone: assessment.genericRuleId === "minor-resonance-form" ? "partial" : "wrong",
        heading: GENERIC_RULE_ID_TO_HEADING[assessment.genericRuleId] ?? "Not quite",
        paragraphs: [learnerSentence(assessment.message)],
      };
    case "wrong":
      return {
        feedbackTone: "wrong",
        heading: "Not this step",
        paragraphs: [
          "These arrows don't lead to the next intermediate. Change them, or take a hint.",
        ],
      };
  }
}
