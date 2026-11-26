/**
 * Tests for fieldEdits.ts: the 8b form fields. The examples stay lint-clean after edits that keep
 * them valid (a renamed state or step, a route preference swapped and back).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  type ChemistryToolkit,
  loadChemistryToolkit,
} from "../chemistryToolkit/chemistryToolkit.js";
import { lintReaction } from "../reactionLinting/reactionLint.js";
import reactionSchemaJson from "../../schema/reaction.schema.json";
import { exampleReaction } from "../testSupport/reactionEdits.js";
import {
  cycleWedgeStyle,
  type FieldEdit,
  REACTION_CLASSES,
  renameState,
  renameStep,
  setReactionField,
  setRoutePreference,
  setStateField,
  setStepField,
} from "./fieldEdits.js";
import { type ReactionDocument, statesOf, stepsOf } from "./reactionDraft.js";

let toolkit: ChemistryToolkit;

beforeAll(async () => {
  toolkit = await loadChemistryToolkit();
});

const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
const wittig = exampleReaction("wittig-methylenation-cyclohexanone.json");

function edited(edit: FieldEdit): ReactionDocument {
  if (edit.outcome !== "edited") {
    throw new Error(`expected an edit, got: ${edit.reason}`);
  }
  return edit.document;
}

function refusalOf(edit: FieldEdit): string {
  return edit.outcome === "refused" ? edit.reason : "edited";
}

function stateRecord(document: ReactionDocument, stateId: string): Record<string, unknown> {
  return statesOf(document)[stateId] as Record<string, unknown>;
}

describe("reaction fields", () => {
  it("sets a text, removing an optional one when cleared and keeping a required one empty", () => {
    expect(edited(setReactionField(sn2, "title", " New title ")).title).toBe("New title");
    expect("subtitle" in edited(setReactionField(sn2, "subtitle", "  "))).toBe(false);
    expect(edited(setReactionField(sn2, "mechanismSummary", "")).mechanismSummary).toBe("");
  });

  it("sets lists and choices, and refuses values the schema does not allow", () => {
    expect(
      edited(setReactionField(sn2, "reactionClasses", ["substitution", "radical"])).reactionClasses,
    ).toEqual(["substitution", "radical"]);
    expect(edited(setReactionField(sn2, "difficultyTier", 3)).difficultyTier).toBe(3);
    expect(refusalOf(setReactionField(sn2, "difficultyTier", 4))).toContain("1 to 3");
    expect(refusalOf(setReactionField(sn2, "reactionClasses", ["magic"]))).toContain("magic");
    expect(
      edited(setReactionField(sn2, "reactionClasses", ["aromatic substitution"])).reactionClasses,
    ).toEqual(["aromatic substitution"]);
    expect(
      edited(setReactionField(sn2, "reactionClasses", ["acid-base", "addition"])).reactionClasses,
    ).toEqual(["acid-base", "addition"]);
    expect(edited(setReactionField(sn2, "spectatorMapNumbers", [4])).spectatorMapNumbers).toEqual([
      4,
    ]);
  });
});

describe("state and step fields", () => {
  it("sets a state's prompt and hints, dropping empty hint tiers and clearing to no key", () => {
    const withHints = edited(
      setStateField(sn2, "reactants", "hintTiers", ["First", " ", "Second"]),
    );
    expect(stateRecord(withHints, "reactants").hintTiers).toEqual(["First", "Second"]);
    const cleared = edited(setStateField(sn2, "reactants", "learnerPrompt", ""));
    expect("learnerPrompt" in stateRecord(cleared, "reactants")).toBe(false);
  });

  it("sets annotations, keeping only those near an atom of the state", () => {
    const annotations = [
      { text: "nucleophile", nearMapNumber: 1 },
      { text: "nowhere", nearMapNumber: 99 },
    ];
    expect(refusalOf(setStateField(sn2, "reactants", "annotations", annotations))).toContain("99");
    const kept = edited(setStateField(sn2, "reactants", "annotations", annotations.slice(0, 1)));
    expect(stateRecord(kept, "reactants").annotations).toEqual(annotations.slice(0, 1));
  });

  it("sets a step's explanation", () => {
    const document = edited(
      setStepField(sn2, "substitution", "explanationAfterStep", "Backside attack."),
    );
    expect(stepsOf(document)[0]?.explanationAfterStep).toBe("Backside attack.");
    expect(refusalOf(setStepField(sn2, "no-such-step", "caption", "x"))).toContain("no-such-step");
  });
});

describe("route preference", () => {
  it("making a branch preferred makes the other step leaving its state accepted", () => {
    const swapped = edited(setRoutePreference(wittig, "betaine-formation", "preferred"));
    const preferenceOf = (stepKey: string): unknown =>
      stepsOf(swapped).find((step) => step.stepKey === stepKey)?.routePreference;
    expect(preferenceOf("betaine-formation")).toBe("preferred");
    expect(preferenceOf("cycloaddition")).toBe("accepted");
    const back = edited(setRoutePreference(swapped, "cycloaddition", "preferred"));
    expect(back).toEqual(wittig);
  });
});

describe("renaming", () => {
  it("renames a state everywhere it is named, and the reaction still lints clean", () => {
    const renamed = edited(renameState(wittig, "reactants", "ylide-and-ketone"));
    expect(renamed.startStateId).toBe("ylide-and-ketone");
    expect(Object.keys(statesOf(renamed))[0]).toBe("ylide-and-ketone");
    expect(stepsOf(renamed).filter((step) => step.fromStateId === "ylide-and-ketone")).toHaveLength(
      2,
    );
    expect(lintReaction(renamed, toolkit)).toEqual([]);
  });

  it("renames a step, and the reaction still lints clean", () => {
    const renamed = edited(renameStep(sn2, "substitution", "backside-attack"));
    expect(stepsOf(renamed)[0]?.stepKey).toBe("backside-attack");
    expect(lintReaction(renamed, toolkit)).toEqual([]);
  });

  it.each([
    ["Upper Case", "slug"],
    ["products", "already"],
    ["", "slug"],
  ])("refuses to rename a state to %j (%s)", (newId, reasonPart) => {
    expect(refusalOf(renameState(sn2, "reactants", newId))).toContain(reasonPart);
  });

  it("refuses to rename a step to a key in use", () => {
    expect(refusalOf(renameStep(wittig, "cycloaddition", "ring-closure"))).toContain("already");
  });
});

describe("cycleWedgeStyle", () => {
  it("cycles plain, wedge, wedge reversed, dash, dash reversed, plain", () => {
    const styles: unknown[] = [];
    let document = sn2;
    for (let tap = 0; tap < 5; tap += 1) {
      document = edited(cycleWedgeStyle(document, "reactants", [2, 3]));
      styles.push(stateRecord(document, "reactants").bondToWedgeStyle);
    }
    expect(styles).toEqual([
      { "2-3": "wedge" },
      { "3-2": "wedge" },
      { "2-3": "dash" },
      { "3-2": "dash" },
      undefined,
    ]);
  });

  it("refuses a pair of atoms that are not bonded", () => {
    expect(refusalOf(cycleWedgeStyle(sn2, "reactants", [1, 3]))).toContain("bond");
  });
});

describe("reaction classes", () => {
  it("offers exactly the classes the reaction schema allows", () => {
    expect([...REACTION_CLASSES]).toEqual(reactionSchemaJson.properties.reactionClasses.items.enum);
  });
});
