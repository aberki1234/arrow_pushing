/**
 * Tests for drawnAnswers.ts: arrows drawn on a state become a misconception, a partial progress
 * message or a partial arrow set. After each accepted addition the example still lints clean;
 * additions the linter would reject are refused at once.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { parseCurvedArrow } from "../arrowNotation/curvedArrowNotation.js";
import {
  type ChemistryToolkit,
  loadChemistryToolkit,
} from "../chemistryToolkit/chemistryToolkit.js";
import { lintReaction } from "../reactionLinting/reactionLint.js";
import { exampleReaction } from "../testSupport/reactionEdits.js";
import {
  addMisconceptionFromArrows,
  addPartialArrowSet,
  addPartialProgressMessage,
  type AnswerEdit,
  moveMisconception,
  removeMisconception,
  removePartialArrowSet,
  removePartialProgressMessage,
  updateMisconception,
} from "./drawnAnswers.js";
import { type ReactionDocument, statesOf, stepsOf } from "./reactionDraft.js";

let toolkit: ChemistryToolkit;

beforeAll(async () => {
  toolkit = await loadChemistryToolkit();
});

const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
const aldol = exampleReaction("aldol-addition-base.json");
const arrows = (...notations: string[]): ReturnType<typeof parseCurvedArrow>[] =>
  notations.map(parseCurvedArrow);
const homolysis = arrows("σ C2-Br3 ~> rad Br3", "σ C2-Br3 ~> rad C2");
const message = {
  severity: "wrong",
  feedbackMessage: "Polar conditions: the bond breaks heterolytically.",
} as const;

function edited(edit: AnswerEdit): ReactionDocument {
  if (edit.outcome !== "edited") {
    throw new Error(`expected an edit, got: ${edit.reason}`);
  }
  return edit.document;
}

function refusalOf(edit: AnswerEdit): string {
  return edit.outcome === "refused" ? edit.reason : "edited";
}

function misconceptionIds(document: ReactionDocument, stateId: string): unknown[] {
  const state = statesOf(document)[stateId] as { misconceptions?: { misconceptionId: string }[] };
  return (state.misconceptions ?? []).map((entry) => entry.misconceptionId);
}

describe("addMisconceptionFromArrows", () => {
  it("adds the exact arrows as a pattern with the next free id; the reaction lints clean", () => {
    const document = edited(addMisconceptionFromArrows(sn2, "reactants", homolysis, message));
    const added = (
      statesOf(document).reactants as { misconceptions: Record<string, unknown>[] }
    ).misconceptions.at(-1);
    expect(added).toEqual({
      misconceptionId: "misconception-1",
      severity: "wrong",
      arrowPattern: "σ C2-Br3 ~> rad Br3; σ C2-Br3 ~> rad C2",
      feedbackMessage: message.feedbackMessage,
    });
    expect(lintReaction(document, toolkit)).toEqual([]);
  });

  it.each([
    [["lp O1 -> σ O1-C2", "σ C2-Br3 -> lp Br3"], "correct answer"],
    [["lp O1 -> σ O1-C2"], "hide a correct answer"],
    [[], "no arrows"],
  ])("refuses %j (%s)", (notations, reasonPart) => {
    expect(
      refusalOf(addMisconceptionFromArrows(sn2, "reactants", arrows(...notations), message)),
    ).toContain(reasonPart);
  });

  it("refuses an empty message", () => {
    const silent = { severity: "wrong", feedbackMessage: " " } as const;
    expect(refusalOf(addMisconceptionFromArrows(sn2, "reactants", homolysis, silent))).toContain(
      "message",
    );
  });
});

describe("changing misconceptions", () => {
  it("loosens a pattern by editing its text, checked as it is changed", () => {
    const document = edited(
      updateMisconception(sn2, "reactants", "attack-on-bromine", { arrowPattern: "lp O* -> Br3" }),
    );
    expect(lintReaction(document, toolkit)).toEqual([]);
    expect(
      refusalOf(
        updateMisconception(sn2, "reactants", "attack-on-bromine", { arrowPattern: "lp O1 ->" }),
      ),
    ).toContain("malformed-arrow-pattern");
    expect(
      refusalOf(
        updateMisconception(sn2, "reactants", "attack-on-bromine", {
          misconceptionId: "bromide-attacks-carbon",
        }),
      ),
    ).toContain("already");
  });

  it("moves and removes entries (the first match wins, so order matters)", () => {
    const moved = edited(moveMisconception(sn2, "reactants", "bond-electrons-to-carbon", -1));
    expect(misconceptionIds(moved, "reactants")).toEqual([
      "attack-on-bromine",
      "bond-electrons-to-carbon",
      "bromide-attacks-carbon",
    ]);
    const removed = edited(removeMisconception(sn2, "reactants", "attack-on-bromine"));
    expect(misconceptionIds(removed, "reactants")).toEqual([
      "bromide-attacks-carbon",
      "bond-electrons-to-carbon",
    ]);
  });
});

describe("partial progress messages and partial arrow sets", () => {
  it("adds a partial progress message for incomplete arrows", () => {
    const document = edited(
      addPartialProgressMessage(
        sn2,
        "reactants",
        homolysis.slice(0, 1),
        "One fish-hook per electron.",
      ),
    );
    const messages = (statesOf(document).reactants as { partialProgressMessages: unknown[] })
      .partialProgressMessages;
    expect(messages.at(-1)).toEqual({
      learnerArrows: ["σ C2-Br3 ~> rad Br3"],
      feedbackMessage: "One fish-hook per electron.",
    });
    expect(lintReaction(document, toolkit)).toEqual([]);
  });

  it("adds another complete arrow set for a step when the validator accepts it", () => {
    const carbanionRoute = arrows("lp O1 -> σ O1-H4", "σ C3-H4 -> lp C3");
    const document = edited(addPartialArrowSet(aldol, "enolate-formation", carbanionRoute));
    expect(stepsOf(document)[0]?.partialArrowSets).toEqual([
      ["lp O1 -> σ O1-H4", "σ C3-H4 -> lp C3"],
    ]);
    expect(lintReaction(document, toolkit)).toEqual([]);
  });

  it.each([
    [["lp O1 -> σ O1-H4"], "not accepted"],
    [["lp O1 -> σ O1-H4", "σ C3-H4 -> π C3-C5", "π C5-O6 -> lp O6"], "already"],
  ])("refuses the arrow set %j (%s)", (notations, reasonPart) => {
    expect(
      refusalOf(addPartialArrowSet(aldol, "enolate-formation", arrows(...notations))),
    ).toContain(reasonPart);
  });
});

describe("removing partial progress messages and partial arrow sets", () => {
  it("removes by position, and refuses a position that is not there", () => {
    const withoutFirst = edited(removePartialProgressMessage(sn2, "reactants", 0));
    const messages = (statesOf(withoutFirst).reactants as { partialProgressMessages: unknown[] })
      .partialProgressMessages;
    expect(messages).toHaveLength(1);
    expect(refusalOf(removePartialProgressMessage(sn2, "reactants", 5))).toContain(
      "no partial progress message 5",
    );
    const carbanionRoute = arrows("lp O1 -> σ O1-H4", "σ C3-H4 -> lp C3");
    const withSet = edited(addPartialArrowSet(aldol, "enolate-formation", carbanionRoute));
    const withoutSet = edited(removePartialArrowSet(withSet, "enolate-formation", 0));
    expect("partialArrowSets" in (stepsOf(withoutSet)[0] ?? {})).toBe(false);
    expect(refusalOf(removePartialArrowSet(aldol, "enolate-formation", 0))).toContain(
      "no partial arrow set 0",
    );
  });
});
