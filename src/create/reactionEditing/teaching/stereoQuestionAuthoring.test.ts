/**
 * Tests for stereoQuestionAuthoring.ts, on the example SN2 with inversion (its step asks a stereo
 * question) and the plain SN2 on bromomethane (its step sets no stereo). The question's own rules
 * are tested in core/stereoQuestions; here: what Create offers and how a drawn arrangement is
 * written back to the file.
 */
import { describe, expect, it } from "vitest";
import { stateGraphFromMappedSmiles } from "../../../core/stateGraphs/mappedSmilesReading.js";
import { exampleReaction } from "../../../testSupport/reactionEdits.js";
import { type ReactionDocument, stepsOf } from "../draft/reactionDraft.js";
import type { FieldEdit } from "../draft/fieldEdits.js";
import {
  addArrangement,
  arrangementDrawing,
  canAcceptEnantiomer,
  setStereoQuestion,
  startStereoQuestion,
  stepCanAskStereo,
  stereoQuestionOf,
  tapArrangement,
} from "./stereoQuestionAuthoring.js";

function edited(edit: FieldEdit): ReactionDocument {
  if (edit.outcome !== "edited") {
    throw new Error(edit.reason);
  }
  return edit.document;
}

const inversion = exampleReaction("sn2-2-bromobutane-inversion.json");
const bromomethane = exampleReaction("sn2-hydroxide-bromomethane.json");

describe("which steps can ask", () => {
  it("a step that sets a stereocentre can; one that sets none cannot", () => {
    expect(stepCanAskStereo(inversion, "substitution")).toBe(true);
    expect(stepCanAskStereo(bromomethane, "substitution")).toBe(false);
  });
  it("either enantiomer can count here: the product has no other stereocentre", () => {
    expect(canAcceptEnantiomer(inversion, "substitution")).toBe(true);
  });
});

describe("starting, removing and drawing arrangements", () => {
  it("removing the question and starting it again gives an empty one-enantiomer question", () => {
    const removed = edited(setStereoQuestion(inversion, "substitution", null));
    expect(stereoQuestionOf(removed, "substitution")).toBeNull();
    expect("stereoQuestion" in (stepsOf(removed)[0] ?? {})).toBe(false);
    const started = edited(startStereoQuestion(removed, "substitution"));
    expect(stereoQuestionOf(started, "substitution")).toEqual({
      acceptEnantiomer: false,
      otherArrangements: [],
    });
  });
  it("a new arrangement starts with its centre unset; taps set it, then flip it", () => {
    const added = edited(addArrangement(inversion, "substitution"));
    const index = (stereoQuestionOf(added, "substitution")?.otherArrangements.length ?? 0) - 1;
    const markAt = (document: ReactionDocument): string | undefined => {
      const smiles =
        stereoQuestionOf(document, "substitution")?.otherArrangements[index]?.mappedSmiles ?? "";
      return stateGraphFromMappedSmiles(smiles).mapNumberToTetrahedralMark?.get(2);
    };
    expect(markAt(added)).toBeUndefined();
    expect(arrangementDrawing(added, "substitution", index, 40).targets[0]?.isSet).toBe(false);
    const once = edited(tapArrangement(added, "substitution", index, "centre-2"));
    const twice = edited(tapArrangement(once, "substitution", index, "centre-2"));
    expect(markAt(once)).toBeDefined();
    expect(markAt(twice)).toBeDefined();
    expect(markAt(once)).not.toBe(markAt(twice));
    expect(arrangementDrawing(once, "substitution", index, 40).targets[0]?.isSet).toBe(true);
  });
  it("the right answer is drawn with every centre set and nothing to tap", () => {
    const { targets } = arrangementDrawing(inversion, "substitution", null, 40);
    expect(targets.every((target) => target.isSet)).toBe(true);
  });
});
