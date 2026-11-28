/**
 * Stereo questions (docs/stereo-question.md): after correct arrows, the learner draws the
 * product's stereochemistry at the step's question centres, and the drawing is assessed.
 *
 * Terms (docs/stereo-question.md §2)
 *   question centre    a stereocentre or double bond whose configuration the step sets: marked in
 *                      the to-state and not carried over unchanged from the from-state (item 12b's
 *                      rule: an arrow touches it, or it was not a marked centre before)
 *   arrangement        one configuration of all the question centres; the right one is the
 *                      to-state's, others are authored (`otherArrangements`)
 *   mirror image       every question centre inverted (cis/trans relations unchanged)
 *
 * Interface
 *   stereoQuestionCentres()   which centres and double bonds a step sets (can it ask at all)
 *   drawnArrangementOf()      the to-state with the learner's marks (null until all are set)
 *   prepareStereoQuestion()   everything worked out once for a step: centres, the right
 *                             arrangement, its mirror image, the authored arrangements
 *   assessStereoAnswer()      the verdict on one drawn arrangement or the racemic-mixture answer
 *   stereoQuestionProblems()  what is wrong with an authored question; the linter and Create's
 *                             live checks report these (one copy of the rules)
 * The arrangements' rewriting after Create regenerates a product: arrangementRegeneration.ts.
 */
import { parseCurvedArrow } from "../arrowNotation/curvedArrowNotation.js";
import type { ArrowStep, OtherArrangement } from "../reactionFiles/reactionFile.js";
import { stereoCarriedOver } from "../stateGraphs/arrowApplication.js";
import { stateGraphFromMappedSmiles } from "../stateGraphs/mappedSmilesReading.js";
import {
  bondedNeighbours,
  type DoubleBondRelation,
  type StateGraph,
  type TetrahedralMark,
  stateGraphsEqualIgnoringStereo,
} from "../stateGraphs/stateGraph.js";

/** Shown for an arrangement no entry lists, when the author wrote no message of their own. */
export const DEFAULT_OTHER_ARRANGEMENT_MESSAGE =
  "Not this arrangement. Think about the face from which each new bond forms.";

interface PreparedArrangement {
  readonly key: string;
  readonly severity: OtherArrangement["severity"];
  readonly feedbackMessage: string;
}

export interface PreparedStereoQuestion {
  /** Map numbers of the question's stereocentres, ascending. */
  readonly questionCentres: readonly number[];
  /** Bond keys of the question's double bonds, sorted. */
  readonly questionDoubleBonds: readonly string[];
  readonly acceptEnantiomer: boolean;
  /** The arrangement key of the to-state, and of its mirror image. */
  readonly rightKey: string;
  readonly mirrorKey: string;
  readonly arrangements: readonly PreparedArrangement[];
  readonly racemicMixture: { readonly isRight: boolean; readonly feedbackMessage: string } | null;
  readonly otherArrangementMessage: string;
}

export type StereoAnswerAssessment =
  | { readonly kind: "right"; readonly feedbackMessage?: string }
  | {
      readonly kind: "authored";
      readonly severity: OtherArrangement["severity"];
      readonly feedbackMessage: string;
    }
  | { readonly kind: "racemicMixtureWrong"; readonly feedbackMessage: string }
  /** The racemic mixture is the answer, and the learner drew one of its two enantiomers. */
  | { readonly kind: "singleEnantiomerOfRacemate" }
  | { readonly kind: "otherArrangement"; readonly feedbackMessage: string };

export type StereoQuestionProblemId =
  | "stereo-question-without-question-centres"
  | "arrangement-not-the-product"
  | "arrangement-changes-other-centres"
  | "arrangement-has-unset-centre"
  | "arrangement-is-the-answer"
  | "arrangement-repeated"
  | "enantiomer-accepted-with-fixed-centres"
  | "enantiomer-rejected-for-racemic-product"
  | "enantiomer-accepted-for-single-enantiomer"
  | "racemic-mixture-right-for-single-enantiomer"
  | "racemic-mixture-right-with-fixed-centres";

export interface StereoQuestionProblem {
  readonly problemId: StereoQuestionProblemId;
  readonly level: "error" | "warning";
  /** The position in `otherArrangements` the problem is about, or null for the whole question. */
  readonly arrangementIndex: number | null;
  readonly message: string;
}

// ---- Question centres ----

function touchedAtoms(step: ArrowStep): Set<number> {
  return new Set(
    step.canonicalArrows.flatMap((notation) => {
      const arrow = parseCurvedArrow(notation);
      return [...arrow.source.atoms, ...arrow.destination.atoms].map((atom) => atom.mapNumber);
    }),
  );
}

/**
 * A step's question centres and double bonds: the to-state's marks the from-state does not carry
 * over unchanged (module comment). Empty for a step that sets no stereo (it cannot ask).
 */
export function stereoQuestionCentres(
  step: ArrowStep,
  fromState: StateGraph,
  toState: StateGraph,
): { centres: number[]; doubleBonds: string[] } {
  const carried = stereoCarriedOver(fromState, toState, touchedAtoms(step));
  const centres = [...(toState.mapNumberToTetrahedralMark ?? [])]
    .filter(([centre, mark]) => carried.mapNumberToTetrahedralMark.get(centre) !== mark)
    .map(([centre]) => centre)
    .sort((first, second) => first - second);
  const doubleBonds = [...(toState.bondToDoubleBondRelation ?? [])]
    .filter(([key, relation]) => carried.bondToDoubleBondRelation.get(key) !== relation)
    .map(([key]) => key)
    .sort();
  return { centres, doubleBonds };
}

// ---- Arrangement keys ----

const UNSET = "?";

/** The arrangement of `graph` at the question centres, as text: "1:@,2:@@|3-4:cis". */
function arrangementKey(
  graph: StateGraph,
  centres: readonly number[],
  doubleBonds: readonly string[],
): string {
  const marks = centres.map(
    (centre) => `${String(centre)}:${graph.mapNumberToTetrahedralMark?.get(centre) ?? UNSET}`,
  );
  const relations = doubleBonds.map(
    (key) => `${key}:${graph.bondToDoubleBondRelation?.get(key) ?? UNSET}`,
  );
  return `${marks.join(",")}|${relations.join(",")}`;
}

/** The same key with every stereocentre inverted (double bonds keep their relation). */
function mirrorKeyOf(key: string): string {
  const [marks = "", relations = ""] = key.split("|");
  const inverted = marks
    .split(",")
    .filter((entry) => entry !== "")
    .map((entry) => {
      const [centre, mark] = entry.split(":");
      const flipped = mark === "@" ? "@@" : mark === "@@" ? "@" : mark;
      return `${centre ?? ""}:${flipped ?? UNSET}`;
    });
  return `${inverted.join(",")}|${relations}`;
}

function readArrangement(mappedSmiles: string): StateGraph | undefined {
  try {
    return stateGraphFromMappedSmiles(mappedSmiles);
  } catch {
    return undefined;
  }
}

// ---- prepare and assess ----

/** Everything about one step's question, worked out once (see the module comment). */
export function prepareStereoQuestion(
  step: ArrowStep,
  fromState: StateGraph,
  toState: StateGraph,
): PreparedStereoQuestion {
  const question = step.stereoQuestion;
  if (question === undefined) {
    throw new Error(`step "${step.stepKey}" has no stereo question`);
  }
  const { centres, doubleBonds } = stereoQuestionCentres(step, fromState, toState);
  const keyOf = (graph: StateGraph): string => arrangementKey(graph, centres, doubleBonds);
  const rightKey = keyOf(toState);
  return {
    questionCentres: centres,
    questionDoubleBonds: doubleBonds,
    acceptEnantiomer: question.acceptEnantiomer,
    rightKey,
    mirrorKey: mirrorKeyOf(rightKey),
    arrangements: question.otherArrangements.flatMap((arrangement) => {
      const graph = readArrangement(arrangement.mappedSmiles);
      return graph === undefined
        ? []
        : [
            {
              key: keyOf(graph),
              severity: arrangement.severity,
              feedbackMessage: arrangement.feedbackMessage,
            },
          ];
    }),
    racemicMixture: question.racemicMixture ?? null,
    otherArrangementMessage: question.otherArrangementMessage ?? DEFAULT_OTHER_ARRANGEMENT_MESSAGE,
  };
}

/** Whether two keys name the same arrangement, counting mirror images when the question does. */
function sameArrangement(question: PreparedStereoQuestion, first: string, second: string): boolean {
  return first === second || (question.acceptEnantiomer && mirrorKeyOf(first) === second);
}

/**
 * The verdict on one answer. `drawn` is the to-state with the learner's marks at every question
 * centre (the screen allows "Check" only once each is set). Throws when the racemic mixture is
 * answered but the question does not offer it.
 */
/**
 * The drawn arrangement: `toState` with the learner's marks at the question centres and relations
 * at the question double bonds, or null while one of them is unset.
 */
export function drawnArrangementOf(
  question: PreparedStereoQuestion,
  toState: StateGraph,
  answer: {
    readonly marks: ReadonlyMap<number, TetrahedralMark>;
    readonly relations: ReadonlyMap<string, DoubleBondRelation>;
  },
): StateGraph | null {
  const allSet =
    question.questionCentres.every((centre) => answer.marks.has(centre)) &&
    question.questionDoubleBonds.every((key) => answer.relations.has(key));
  if (!allSet) {
    return null;
  }
  return {
    ...toState,
    mapNumberToTetrahedralMark: new Map([
      ...(toState.mapNumberToTetrahedralMark ?? []),
      ...answer.marks,
    ]),
    bondToDoubleBondRelation: new Map([
      ...(toState.bondToDoubleBondRelation ?? []),
      ...answer.relations,
    ]),
  };
}

export function assessStereoAnswer(
  question: PreparedStereoQuestion,
  answer: { readonly drawn: StateGraph } | { readonly racemicMixture: true },
): StereoAnswerAssessment {
  if ("racemicMixture" in answer) {
    const offered = question.racemicMixture;
    if (offered === null) {
      throw new Error("this stereo question does not offer the racemic mixture");
    }
    return offered.isRight
      ? { kind: "right", feedbackMessage: offered.feedbackMessage }
      : { kind: "racemicMixtureWrong", feedbackMessage: offered.feedbackMessage };
  }
  const key = arrangementKey(answer.drawn, question.questionCentres, question.questionDoubleBonds);
  const isProductOrMirror = key === question.rightKey || key === question.mirrorKey;
  if (question.racemicMixture?.isRight === true && isProductOrMirror) {
    return { kind: "singleEnantiomerOfRacemate" };
  }
  if (sameArrangement(question, question.rightKey, key)) {
    return { kind: "right" };
  }
  const authored = question.arrangements.find((arrangement) =>
    sameArrangement(question, arrangement.key, key),
  );
  return authored === undefined
    ? { kind: "otherArrangement", feedbackMessage: question.otherArrangementMessage }
    : { kind: "authored", severity: authored.severity, feedbackMessage: authored.feedbackMessage };
}

// ---- Problems (the lint rules) ----

/** The atoms of the molecules that hold a question centre. */
function productMolecule(toState: StateGraph, centres: readonly number[]): Set<number> {
  const reached = new Set(centres);
  const toVisit = [...centres];
  for (let current = toVisit.pop(); current !== undefined; current = toVisit.pop()) {
    for (const { mapNumber } of bondedNeighbours(toState, current)) {
      if (!reached.has(mapNumber)) {
        reached.add(mapNumber);
        toVisit.push(mapNumber);
      }
    }
  }
  return reached;
}

/** Whether the product molecule has stereocentres the step does not set. */
function hasFixedCentres(toState: StateGraph, centres: readonly number[]): boolean {
  const molecule = productMolecule(toState, centres);
  return [...(toState.mapNumberToTetrahedralMark?.keys() ?? [])].some(
    (centre) => molecule.has(centre) && !centres.includes(centre),
  );
}

/** Whether the arrangement's marks differ from the to-state's anywhere but at question centres. */
function changesOtherCentres(
  arrangement: StateGraph,
  toState: StateGraph,
  prepared: {
    readonly questionCentres: readonly number[];
    readonly questionDoubleBonds: readonly string[];
  },
): boolean {
  const differs = <Key>(
    first: ReadonlyMap<Key, string> | undefined,
    second: ReadonlyMap<Key, string> | undefined,
    asked: (key: Key) => boolean,
  ): boolean => {
    const keys = new Set([...(first?.keys() ?? []), ...(second?.keys() ?? [])]);
    return [...keys].some((key) => !asked(key) && first?.get(key) !== second?.get(key));
  };
  return (
    differs(arrangement.mapNumberToTetrahedralMark, toState.mapNumberToTetrahedralMark, (centre) =>
      prepared.questionCentres.includes(centre),
    ) ||
    differs(arrangement.bondToDoubleBondRelation, toState.bondToDoubleBondRelation, (key) =>
      prepared.questionDoubleBonds.includes(key),
    )
  );
}

const PROBLEM_MESSAGES: Readonly<Record<StereoQuestionProblemId, string>> = {
  "stereo-question-without-question-centres":
    "The step sets no stereocentre or cis/trans double bond, so there is nothing to draw.",
  "arrangement-not-the-product":
    "This arrangement is not the step's product with other stereo: its atoms or bonds " +
    "differ, or its SMILES cannot be read.",
  "arrangement-changes-other-centres":
    "This arrangement changes a centre the step does not set; the learner cannot tap it.",
  "arrangement-has-unset-centre":
    "This arrangement leaves a question centre without a configuration.",
  "arrangement-is-the-answer":
    "This arrangement is the right answer (or its mirror image, which also counts).",
  "arrangement-repeated":
    "This arrangement repeats an earlier one (or its mirror image, which it already covers).",
  "enantiomer-accepted-with-fixed-centres":
    "Either enantiomer cannot count here: the product has a stereocentre the step does not " +
    "set, so inverting the tapped centres gives a diastereomer.",
  "enantiomer-rejected-for-racemic-product":
    "The product is marked racemic, so its mirror image forms just as much; accept either " +
    "enantiomer.",
  "enantiomer-accepted-for-single-enantiomer":
    "Either enantiomer is accepted but the product is not marked racemic. Mark it racemic if " +
    "both form.",
  "racemic-mixture-right-for-single-enantiomer":
    "The racemic mixture is the answer, but the product is not marked racemic.",
  "racemic-mixture-right-with-fixed-centres":
    "The racemic mixture cannot be the answer here: the product has a stereocentre the step " +
    "does not set.",
};

function problem(
  problemId: StereoQuestionProblemId,
  arrangementIndex: number | null,
  level: "error" | "warning" = "error",
): StereoQuestionProblem {
  return { problemId, level, arrangementIndex, message: PROBLEM_MESSAGES[problemId] };
}

/** The first problem of one authored arrangement, if any (later checks assume the earlier pass). */
function arrangementProblem(
  arrangement: OtherArrangement,
  index: number,
  context: {
    toState: StateGraph;
    prepared: PreparedStereoQuestion;
    earlierKeys: readonly string[];
  },
): StereoQuestionProblem | undefined {
  const { toState, prepared } = context;
  const graph = readArrangement(arrangement.mappedSmiles);
  if (graph === undefined || !stateGraphsEqualIgnoringStereo(graph, toState)) {
    return problem("arrangement-not-the-product", index);
  }
  if (changesOtherCentres(graph, toState, prepared)) {
    return problem("arrangement-changes-other-centres", index);
  }
  const key = arrangementKey(graph, prepared.questionCentres, prepared.questionDoubleBonds);
  if (key.includes(UNSET)) {
    return problem("arrangement-has-unset-centre", index);
  }
  if (sameArrangement(prepared, prepared.rightKey, key)) {
    return problem("arrangement-is-the-answer", index);
  }
  if (context.earlierKeys.some((earlier) => sameArrangement(prepared, earlier, key))) {
    return problem("arrangement-repeated", index);
  }
  return undefined;
}

/** The enantiomer and racemic-mixture rules of docs/stereo-question.md §4, in this order. */
function enantiomerProblems(
  step: ArrowStep,
  toState: StateGraph,
  prepared: PreparedStereoQuestion,
  toStateIsRacemic: boolean,
): StereoQuestionProblem[] {
  const fixed = hasFixedCentres(toState, prepared.questionCentres);
  const accepts = prepared.acceptEnantiomer;
  const racemicIsRight = step.stereoQuestion?.racemicMixture?.isRight === true;
  const rules: readonly [StereoQuestionProblemId, boolean, "error" | "warning"][] = [
    ["enantiomer-accepted-with-fixed-centres", accepts && fixed, "error"],
    [
      "enantiomer-rejected-for-racemic-product",
      !accepts && toStateIsRacemic && !fixed && !racemicIsRight,
      "error",
    ],
    ["enantiomer-accepted-for-single-enantiomer", accepts && !toStateIsRacemic, "warning"],
    ["racemic-mixture-right-for-single-enantiomer", racemicIsRight && !toStateIsRacemic, "error"],
    ["racemic-mixture-right-with-fixed-centres", racemicIsRight && fixed, "error"],
  ];
  return rules
    .filter(([, applies]) => applies)
    .map(([problemId, , level]) => problem(problemId, null, level));
}

/**
 * Everything wrong with a step's stereo question (docs/stereo-question.md §4), in a fixed order:
 * the question, then each arrangement (its first problem only), then the enantiomer rules.
 * `toStateIsRacemic` is the to-state's `stereoMeaning === "racemic"`.
 */
export function stereoQuestionProblems(
  step: ArrowStep,
  fromState: StateGraph,
  toState: StateGraph,
  toStateIsRacemic: boolean,
): StereoQuestionProblem[] {
  const prepared = prepareStereoQuestion(step, fromState, toState);
  if (prepared.questionCentres.length === 0 && prepared.questionDoubleBonds.length === 0) {
    return [problem("stereo-question-without-question-centres", null)];
  }
  const found: StereoQuestionProblem[] = [];
  const earlierKeys: string[] = [];
  (step.stereoQuestion?.otherArrangements ?? []).forEach((arrangement, index) => {
    const arrangementFound = arrangementProblem(arrangement, index, {
      toState,
      prepared,
      earlierKeys,
    });
    if (arrangementFound === undefined) {
      const graph = readArrangement(arrangement.mappedSmiles);
      if (graph !== undefined) {
        earlierKeys.push(
          arrangementKey(graph, prepared.questionCentres, prepared.questionDoubleBonds),
        );
      }
    } else {
      found.push(arrangementFound);
    }
  });
  return [...found, ...enantiomerProblems(step, toState, prepared, toStateIsRacemic)];
}
