/**
 * Tests for stereoQuestions.ts (docs/stereo-question.md). References: the SN2 example (inversion
 * is right, retention and the racemic mixture are authored wrong answers); hydroboration (syn is
 * right, racemic, so the mirror image counts); an SN1 step whose answer is the racemic mixture;
 * bromination step 2 (C2 set by the bromonium ion, so "either enantiomer" cannot apply).
 */
import { describe, expect, it } from "vitest";
import type { ArrowStep, StereoQuestion } from "../reactionFiles/reactionFile.js";
import { stateGraphFromMappedSmiles } from "../stateGraphs/mappedSmilesReading.js";
import { readFixtureJson } from "../../testSupport/fixtureFiles.js";
import { arrangementsForNewProduct } from "./arrangementRegeneration.js";
import {
  assessStereoAnswer,
  drawnArrangementOf,
  prepareStereoQuestion,
  stereoQuestionProblems,
} from "./stereoQuestions.js";

const read = stateGraphFromMappedSmiles;

function arrowStep(canonicalArrows: string[], stereoQuestion: StereoQuestion): ArrowStep {
  return {
    stepKey: "step",
    fromStateId: "from",
    toStateId: "to",
    stepKind: "polar",
    routePreference: "preferred",
    canonicalArrows,
    stereoQuestion,
  };
}

// ---- SN2 (the example reaction) ----
const sn2 = readFixtureJson("reactions/sn2-2-bromobutane-inversion.json") as {
  stateIdToState: Record<string, { mappedSmiles: string }>;
  steps: ArrowStep[];
};
const sn2Step = sn2.steps[0] as ArrowStep;
const sn2From = read(sn2.stateIdToState.reactants?.mappedSmiles ?? "");
const sn2To = read(sn2.stateIdToState.products?.mappedSmiles ?? "");
const retention = read("[OH:1][C@H:2]([CH3:5])[CH2:6][CH3:7].[Br-:3].[Na+:4]");

describe("SN2: one enantiomer, inversion", () => {
  const question = prepareStereoQuestion(sn2Step, sn2From, sn2To);
  it("asks about the attacked carbon only", () => {
    expect(question.questionCentres).toEqual([2]);
    expect(question.questionDoubleBonds).toEqual([]);
  });
  it("the inverted product is right", () => {
    expect(assessStereoAnswer(question, { drawn: sn2To })).toEqual({ kind: "right" });
  });
  it("retention gets its authored message (acceptEnantiomer is false)", () => {
    expect(assessStereoAnswer(question, { drawn: retention })).toMatchObject({
      kind: "authored",
      severity: "wrong",
    });
  });
  it("the racemic mixture is a wrong answer with its message", () => {
    expect(assessStereoAnswer(question, { racemicMixture: true })).toMatchObject({
      kind: "racemicMixtureWrong",
    });
  });
  it("has no problems", () => {
    expect(stereoQuestionProblems(sn2Step, sn2From, sn2To, false)).toEqual([]);
  });
});

// ---- Hydroboration: racemic, two question centres ----
const borane = read("[CH3:7][C:1]1=[CH:2][CH2:3][CH2:4][CH2:5][CH2:6]1.[H:9][BH2:8]");
const syn = "[C@:1]1([H:9])([CH3:7])[C@@H:2]([BH2:8])[CH2:3][CH2:4][CH2:5][CH2:6]1";
const anti = "[C@@:1]1([H:9])([CH3:7])[C@@H:2]([BH2:8])[CH2:3][CH2:4][CH2:5][CH2:6]1";
const synMirror = "[C@@:1]1([H:9])([CH3:7])[C@H:2]([BH2:8])[CH2:3][CH2:4][CH2:5][CH2:6]1";
const antiMirror = "[C@:1]1([H:9])([CH3:7])[C@H:2]([BH2:8])[CH2:3][CH2:4][CH2:5][CH2:6]1";
const hydroborationArrows = ["π C1-C2 -> σ C2-B8", "σ H9-B8 -> σ C1-H9"];
const antiArrangement = { mappedSmiles: anti, severity: "wrong" as const, feedbackMessage: "anti" };

describe("hydroboration: racemic, either enantiomer", () => {
  const step = arrowStep(hydroborationArrows, {
    acceptEnantiomer: true,
    otherArrangements: [antiArrangement],
  });
  const question = prepareStereoQuestion(step, borane, read(syn));
  it("asks about both new centres", () => {
    expect(question.questionCentres).toEqual([1, 2]);
  });
  it("the product and its mirror image are right", () => {
    expect(assessStereoAnswer(question, { drawn: read(syn) })).toEqual({ kind: "right" });
    expect(assessStereoAnswer(question, { drawn: read(synMirror) })).toEqual({ kind: "right" });
  });
  it("anti and its mirror image both get the authored message", () => {
    for (const drawn of [anti, antiMirror]) {
      expect(assessStereoAnswer(question, { drawn: read(drawn) })).toMatchObject({
        kind: "authored",
        feedbackMessage: "anti",
      });
    }
  });
});

describe("hydroboration: problems with the authored question", () => {
  const step = arrowStep(hydroborationArrows, {
    acceptEnantiomer: true,
    otherArrangements: [antiArrangement],
  });
  it("lists a repeated mirror image and a copy of the answer's mirror image", () => {
    const repeated = arrowStep(hydroborationArrows, {
      acceptEnantiomer: true,
      otherArrangements: [
        antiArrangement,
        { ...antiArrangement, mappedSmiles: antiMirror },
        { ...antiArrangement, mappedSmiles: synMirror },
      ],
    });
    expect(
      stereoQuestionProblems(repeated, borane, read(syn), true).map((problem) => [
        problem.problemId,
        problem.arrangementIndex,
      ]),
    ).toEqual([
      ["arrangement-repeated", 1],
      ["arrangement-is-the-answer", 2],
    ]);
  });
  it("warns when either enantiomer is accepted but the product is not marked racemic", () => {
    expect(stereoQuestionProblems(step, borane, read(syn), false)).toEqual([
      expect.objectContaining({
        problemId: "enantiomer-accepted-for-single-enantiomer",
        level: "warning",
      }),
    ]);
  });
  it("refuses one enantiomer only, for a racemic product", () => {
    const strict = arrowStep(hydroborationArrows, {
      acceptEnantiomer: false,
      otherArrangements: [],
    });
    expect(
      stereoQuestionProblems(strict, borane, read(syn), true).map((found) => found.problemId),
    ).toEqual(["enantiomer-rejected-for-racemic-product"]);
  });
});

describe("arrangements that cannot be drawn", () => {
  const ask = (mappedSmiles: string): string[] =>
    stereoQuestionProblems(
      arrowStep(hydroborationArrows, {
        acceptEnantiomer: true,
        otherArrangements: [{ mappedSmiles, severity: "wrong", feedbackMessage: "x" }],
      }),
      borane,
      read(syn),
      true,
    ).map((problem) => problem.problemId);
  it.each([
    [
      "not the product",
      "[CH3:7][CH:1]1[CH:2]([OH:8])[CH2:3][CH2:4][CH2:5][CH2:6]1.[H:9]",
      "arrangement-not-the-product",
    ],
    ["unreadable", "[CH3:7", "arrangement-not-the-product"],
    [
      "a centre left unset",
      "[C:1]1([H:9])([CH3:7])[C@@H:2]([BH2:8])[CH2:3][CH2:4][CH2:5][CH2:6]1",
      "arrangement-has-unset-centre",
    ],
    ["the answer itself", syn, "arrangement-is-the-answer"],
  ])("%s", (caseName, mappedSmiles, problemId) => {
    expect(ask(mappedSmiles)).toEqual([problemId]);
  });
});

// ---- Bromination step 2: C2 is fixed by the bromonium ion ----
const bromonium = read("[C@@H:1]12[C@@H:2]([CH2:3][CH2:4][CH2:5][CH2:6]1)[Br+:7]2.[Br-:8]");
const trans = read("[C@@H:1]1([C@@H:2]([CH2:3][CH2:4][CH2:5][CH2:6]1)[Br:7])[Br:8]");
const openingArrows = ["lp Br8 -> σ Br8-C1", "σ C1-Br7 -> lp Br7"];

describe("bromination step 2: a fixed centre", () => {
  it("asks about C1 only", () => {
    const step = arrowStep(openingArrows, { acceptEnantiomer: false, otherArrangements: [] });
    expect(prepareStereoQuestion(step, bromonium, trans).questionCentres).toEqual([1]);
  });
  it("cannot accept either enantiomer, and need not, although the product is racemic", () => {
    const accepting = arrowStep(openingArrows, { acceptEnantiomer: true, otherArrangements: [] });
    expect(
      stereoQuestionProblems(accepting, bromonium, trans, true).map((found) => found.problemId),
    ).toEqual(["enantiomer-accepted-with-fixed-centres"]);
    const strict = arrowStep(openingArrows, { acceptEnantiomer: false, otherArrangements: [] });
    expect(stereoQuestionProblems(strict, bromonium, trans, true)).toEqual([]);
  });
  it("cannot make the racemic mixture the answer", () => {
    const step = arrowStep(openingArrows, {
      acceptEnantiomer: false,
      otherArrangements: [],
      racemicMixture: { isRight: true, feedbackMessage: "both" },
    });
    expect(
      stereoQuestionProblems(step, bromonium, trans, true).map((found) => found.problemId),
    ).toEqual(["racemic-mixture-right-with-fixed-centres"]);
  });
  it("an arrangement that changes C2 cannot be drawn", () => {
    const step = arrowStep(openingArrows, {
      acceptEnantiomer: false,
      otherArrangements: [
        {
          mappedSmiles: "[C@@H:1]1([C@H:2]([CH2:3][CH2:4][CH2:5][CH2:6]1)[Br:7])[Br:8]",
          severity: "wrong",
          feedbackMessage: "x",
        },
      ],
    });
    expect(
      stereoQuestionProblems(step, bromonium, trans, true).map((found) => found.problemId),
    ).toEqual(["arrangement-changes-other-centres"]);
  });
});

// ---- SN1: the racemic mixture is the answer ----
const cation = read("[CH3:1][CH+:2][CH2:3][CH3:4].[OH2:5]");
const alcohol = read("[CH3:1][C@@H:2]([OH2+:5])[CH2:3][CH3:4]");
const sn1Step = arrowStep(["lp O5 -> σ O5-C2"], {
  acceptEnantiomer: true,
  otherArrangements: [],
  racemicMixture: { isRight: true, feedbackMessage: "either face" },
});

describe("SN1: the racemic mixture is right", () => {
  const question = prepareStereoQuestion(sn1Step, cation, alcohol);
  it("ticking the racemic mixture is right, with its message", () => {
    expect(assessStereoAnswer(question, { racemicMixture: true })).toEqual({
      kind: "right",
      feedbackMessage: "either face",
    });
  });
  it("drawing one enantiomer is plausible but not the whole answer", () => {
    expect(assessStereoAnswer(question, { drawn: alcohol })).toEqual({
      kind: "singleEnantiomerOfRacemate",
    });
  });
  it("needs the product marked racemic", () => {
    expect(
      stereoQuestionProblems(sn1Step, cation, alcohol, false).map((found) => found.problemId),
    ).toEqual([
      "enantiomer-accepted-for-single-enantiomer",
      "racemic-mixture-right-for-single-enantiomer",
    ]);
    expect(stereoQuestionProblems(sn1Step, cation, alcohol, true)).toEqual([]);
  });
});

describe("questions with nothing to ask", () => {
  it("a step that sets no stereo", () => {
    const step = arrowStep(["lp O5 -> σ O5-C2"], {
      acceptEnantiomer: false,
      otherArrangements: [],
    });
    const flat = read("[CH3:1][CH:2]([OH2+:5])[CH3:4]");
    expect(
      stereoQuestionProblems(step, read("[CH3:1][CH+:2][CH3:4].[OH2:5]"), flat, false).map(
        (found) => found.problemId,
      ),
    ).toEqual(["stereo-question-without-question-centres"]);
  });
  it("any other arrangement gets the default message unless the author wrote one", () => {
    const step = arrowStep(hydroborationArrows, { acceptEnantiomer: true, otherArrangements: [] });
    const question = prepareStereoQuestion(step, borane, read(syn));
    expect(assessStereoAnswer(question, { drawn: read(anti) })).toMatchObject({
      kind: "otherArrangement",
    });
  });
});

describe("the drawn arrangement", () => {
  // Reference: the SN2 product's own mark at C2 (the right answer read from the file).
  const question = prepareStereoQuestion(sn2Step, sn2From, sn2To);
  const productMark = sn2To.mapNumberToTetrahedralMark?.get(2);
  const otherMark = productMark === "@" ? "@@" : "@";
  it("is null until every question centre is set", () => {
    expect(
      drawnArrangementOf(question, sn2To, { marks: new Map(), relations: new Map() }),
    ).toBeNull();
  });
  it("is the to-state with the learner's marks, assessed like any drawing", () => {
    const drawn = drawnArrangementOf(question, sn2To, {
      marks: new Map([[2, otherMark]]),
      relations: new Map(),
    });
    expect(drawn?.mapNumberToTetrahedralMark?.get(2)).toBe(otherMark);
    expect(drawn === null ? null : assessStereoAnswer(question, { drawn }).kind).toBe("authored");
  });
});

describe("arrangements after the product is regenerated", () => {
  const longer = read("[OH:1][C@@H:2]([CH3:5])[CH2:6][CH2:7][CH3:8].[Br-:3].[Na+:4]");
  const longerFrom = read("[OH-:1].[CH3:5][C@@H:2]([Br:3])[CH2:6][CH2:7][CH3:8].[Na+:4]");
  it("keeps which centres are inverted, on the new product", () => {
    const rewritten = arrangementsForNewProduct(
      sn2Step,
      { fromState: sn2From, toState: sn2To },
      {
        fromState: longerFrom,
        toState: longer,
      },
    );
    expect(rewritten[0]?.mappedSmiles).toBe(
      "[OH:1][C@H:2]([CH3:5])[CH2:6][CH2:7][CH3:8].[Br-:3].[Na+:4]",
    );
    expect(rewritten[0]?.feedbackMessage).toBe(
      sn2Step.stereoQuestion?.otherArrangements[0]?.feedbackMessage,
    );
  });
  it("leaves the arrangements as they were when the question centres change", () => {
    // The new product has no stereocentre: nothing to carry over, so the lint tells the author.
    const flat = read("[OH:1][CH2:2][CH2:6][CH3:7].[Br-:3].[Na+:4]");
    const flatFrom = read("[OH-:1].[CH2:2]([Br:3])[CH2:6][CH3:7].[Na+:4]");
    const rewritten = arrangementsForNewProduct(
      sn2Step,
      { fromState: sn2From, toState: sn2To },
      {
        fromState: flatFrom,
        toState: flat,
      },
    );
    expect(rewritten).toEqual(sn2Step.stereoQuestion?.otherArrangements);
  });
});
