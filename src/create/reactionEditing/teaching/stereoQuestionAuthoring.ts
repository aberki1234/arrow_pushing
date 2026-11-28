/**
 * Create's stereo question item (docs/stereo-question.md; the prototype is
 * mockups/stereo-choice/author.html).
 *
 * Here: which steps can ask, starting or removing a question, and drawing and tapping each
 * authored arrangement with the learner's own control.
 * Everything else (verdicts, messages, the enantiomer and racemic-mixture options) is set by
 * replacing the whole question.
 * Its problems are the lint findings at the step's "stereoQuestion" place, so the rules live in
 * one place (core/stereoQuestions).
 */
import { parseCurvedArrow } from "../../../core/arrowNotation/curvedArrowNotation.js";
import { isRecord } from "../../../core/jsonValues/jsonValues.js";
import type { ArrowStep, StereoQuestion } from "../../../core/reactionFiles/reactionFile.js";
import { stateGraphFromMappedSmiles } from "../../../core/stateGraphs/mappedSmilesReading.js";
import { mappedSmilesFromStateGraph } from "../../../core/stateGraphs/mappedSmilesWriting.js";
import type { StateGraph } from "../../../core/stateGraphs/stateGraph.js";
import {
  stereoQuestionCentres,
  stereoQuestionProblems,
} from "../../../core/stereoQuestions/stereoQuestions.js";
import { markAfterTap } from "../../../drawing/moleculeDrawing/shared/stereoDrawing.js";
import { questionDrawingFields } from "../../../drawing/moleculeDrawing/shared/stereoQuestionDrawing.js";
import {
  type QuestionTarget,
  questionTargets,
} from "../../../drawing/moleculeDrawing/state/questionTargets.js";
import {
  type StateDrawing,
  drawState,
} from "../../../drawing/moleculeDrawing/state/stateDrawing.js";
import type { FieldEdit } from "../draft/fieldEdits.js";
import { type ReactionDocument, statesOf, stepsOf } from "../draft/reactionDraft.js";

type JsonRecord = Readonly<Record<string, unknown>>;

interface StepContext {
  readonly step: ArrowStep;
  readonly fromGraph: StateGraph;
  readonly toGraph: StateGraph;
  readonly toState: JsonRecord;
  readonly centres: readonly number[];
  readonly doubleBonds: readonly string[];
}

/** The step as an arrow step with its states read, or undefined (no such step, a change step). */
function contextOf(document: ReactionDocument, stepKey: string): StepContext | undefined {
  const raw = stepsOf(document).find((step) => step.stepKey === stepKey);
  if (raw === undefined || raw.stepKind === "change") {
    return undefined;
  }
  const states = statesOf(document);
  const fromState = states[String(raw.fromStateId)];
  const toState = states[String(raw.toStateId)];
  if (!isRecord(fromState) || !isRecord(toState)) {
    return undefined;
  }
  const step = raw as unknown as ArrowStep;
  try {
    const fromGraph = stateGraphFromMappedSmiles(String(fromState.mappedSmiles));
    const toGraph = stateGraphFromMappedSmiles(String(toState.mappedSmiles));
    step.canonicalArrows.forEach((notation) => parseCurvedArrow(notation));
    const { centres, doubleBonds } = stereoQuestionCentres(step, fromGraph, toGraph);
    return { step, fromGraph, toGraph, toState, centres, doubleBonds };
  } catch {
    return undefined;
  }
}

/** Whether the step sets a stereocentre or a cis/trans double bond, so it can ask. */
export function stepCanAskStereo(document: ReactionDocument, stepKey: string): boolean {
  const context = contextOf(document, stepKey);
  return context !== undefined && context.centres.length + context.doubleBonds.length > 0;
}

/** The step's question, or null when it asks none. */
export function stereoQuestionOf(
  document: ReactionDocument,
  stepKey: string,
): StereoQuestion | null {
  return contextOf(document, stepKey)?.step.stereoQuestion ?? null;
}

/** The document with the step's question replaced (null removes it). */
export function setStereoQuestion(
  document: ReactionDocument,
  stepKey: string,
  question: StereoQuestion | null,
): FieldEdit {
  if (contextOf(document, stepKey) === undefined) {
    return { outcome: "refused", reason: `no arrow step "${stepKey}"` };
  }
  const steps = stepsOf(document).map((step) => {
    if (step.stepKey !== stepKey) {
      return step;
    }
    const withoutQuestion = Object.fromEntries(
      Object.entries(step).filter(([key]) => key !== "stereoQuestion"),
    );
    return question === null ? withoutQuestion : { ...withoutQuestion, stereoQuestion: question };
  });
  return { outcome: "edited", document: { ...document, steps } };
}

/**
 * Whether "either enantiomer counts" is possible: not when the product has a stereocentre the
 * step does not set (the core rule enantiomer-accepted-with-fixed-centres).
 */
export function canAcceptEnantiomer(document: ReactionDocument, stepKey: string): boolean {
  const context = contextOf(document, stepKey);
  if (context === undefined) {
    return false;
  }
  const trial: ArrowStep = {
    ...context.step,
    stereoQuestion: { acceptEnantiomer: true, otherArrangements: [] },
  };
  return !stereoQuestionProblems(trial, context.fromGraph, context.toGraph, true).some(
    (problem) => problem.problemId === "enantiomer-accepted-with-fixed-centres",
  );
}

/** A new question: either enantiomer counts when the product is racemic and that is possible. */
export function startStereoQuestion(document: ReactionDocument, stepKey: string): FieldEdit {
  const context = contextOf(document, stepKey);
  if (context === undefined) {
    return { outcome: "refused", reason: `no arrow step "${stepKey}"` };
  }
  const racemic = context.toState.stereoMeaning === "racemic";
  return setStereoQuestion(document, stepKey, {
    acceptEnantiomer: racemic && canAcceptEnantiomer(document, stepKey),
    otherArrangements: [],
  });
}

/** The product with every question centre and double bond unset. */
function unsetProduct(context: StepContext): StateGraph {
  return {
    ...context.toGraph,
    mapNumberToTetrahedralMark: new Map(
      [...(context.toGraph.mapNumberToTetrahedralMark ?? [])].filter(
        ([centre]) => !context.centres.includes(centre),
      ),
    ),
    bondToDoubleBondRelation: new Map(
      [...(context.toGraph.bondToDoubleBondRelation ?? [])].filter(
        ([key]) => !context.doubleBonds.includes(key),
      ),
    ),
  };
}

/** A new arrangement, its centres unset (the lint asks for them until they are drawn). */
export function addArrangement(document: ReactionDocument, stepKey: string): FieldEdit {
  const context = contextOf(document, stepKey);
  const question = context?.step.stereoQuestion;
  if (context === undefined || question === undefined) {
    return { outcome: "refused", reason: `step "${stepKey}" asks no stereo question` };
  }
  return setStereoQuestion(document, stepKey, {
    ...question,
    otherArrangements: [
      ...question.otherArrangements,
      {
        mappedSmiles: mappedSmilesFromStateGraph(unsetProduct(context)),
        severity: "wrong",
        feedbackMessage: "",
      },
    ],
  });
}

/** The arrangement's graph (index), or the right answer's (null). */
function arrangementGraph(context: StepContext, index: number | null): StateGraph {
  if (index === null) {
    return context.toGraph;
  }
  const smiles = context.step.stereoQuestion?.otherArrangements[index]?.mappedSmiles ?? "";
  try {
    return stateGraphFromMappedSmiles(smiles);
  } catch {
    return unsetProduct(context);
  }
}

function productDisplay(context: StepContext): {
  mapNumberToCoordinates: Readonly<Record<string, readonly number[]>>;
  bondToWedgeStyle?: Readonly<Record<string, "wedge" | "dash">>;
} {
  const coordinates = context.toState.mapNumberToCoordinates;
  const wedges = context.toState.bondToWedgeStyle;
  return {
    mapNumberToCoordinates: (isRecord(coordinates) ? coordinates : {}) as Record<string, number[]>,
    ...(isRecord(wedges) ? { bondToWedgeStyle: wedges as Record<string, "wedge" | "dash"> } : {}),
  };
}

/** The arrangement graph with the double bond `key` set to trans, or flipped when set. */
function withDoubleBondTapped(graph: StateGraph, key: string): StateGraph {
  const current = graph.bondToDoubleBondRelation?.get(key);
  const relations = new Map(graph.bondToDoubleBondRelation ?? []);
  return {
    ...graph,
    bondToDoubleBondRelation: relations.set(key, current === "trans" ? "cis" : "trans"),
  };
}

/** The arrangement with `centre` tapped (the learner's cycle), or undefined if it cannot be. */
function withCentreTapped(
  context: StepContext,
  graph: StateGraph,
  centre: number,
): StateGraph | undefined {
  const display = productDisplay(context);
  const { centreToWedgeBond } = questionDrawingFields(
    context.toGraph,
    display,
    { centres: context.centres, doubleBonds: context.doubleBonds },
    { marks: new Map(), relations: new Map() },
  );
  const wedgeBond = centreToWedgeBond.get(centre);
  if (wedgeBond === undefined) {
    return undefined;
  }
  const current = graph.mapNumberToTetrahedralMark?.get(centre);
  // The author knows the answer, so the cycle can always start with a wedge.
  const mark = markAfterTap(
    context.toGraph,
    display.mapNumberToCoordinates,
    wedgeBond,
    current,
    "wedge",
  );
  if (mark === undefined) {
    return undefined;
  }
  const marks = new Map(graph.mapNumberToTetrahedralMark ?? []);
  return { ...graph, mapNumberToTetrahedralMark: marks.set(centre, mark) };
}

/** One tap on an arrangement's target: the learner's control (unset → wedge → dash → wedge). */
export function tapArrangement(
  document: ReactionDocument,
  stepKey: string,
  index: number,
  targetId: string,
): FieldEdit {
  const context = contextOf(document, stepKey);
  const question = context?.step.stereoQuestion;
  if (context === undefined || question?.otherArrangements[index] === undefined) {
    return { outcome: "refused", reason: `no arrangement ${String(index + 1)}` };
  }
  const graph = arrangementGraph(context, index);
  const next = targetId.startsWith("bond-")
    ? withDoubleBondTapped(graph, targetId.slice("bond-".length))
    : withCentreTapped(context, graph, Number(targetId.slice("centre-".length)));
  if (next === undefined) {
    return { outcome: "refused", reason: "this centre cannot be drawn here" };
  }
  const otherArrangements = question.otherArrangements.map((entry, position) =>
    position === index ? { ...entry, mappedSmiles: mappedSmilesFromStateGraph(next) } : entry,
  );
  return setStereoQuestion(document, stepKey, { ...question, otherArrangements });
}

/** An arrangement (index) or the right answer (null), drawn, with its targets. */
export function arrangementDrawing(
  document: ReactionDocument,
  stepKey: string,
  index: number | null,
  pixelsPerUnit: number,
): { drawing: StateDrawing; targets: QuestionTarget[] } {
  const context = contextOf(document, stepKey);
  if (context === undefined) {
    throw new Error(`no arrow step "${stepKey}"`);
  }
  const graph = arrangementGraph(context, index);
  const marks = new Map(
    [...(graph.mapNumberToTetrahedralMark ?? [])].filter(([centre]) =>
      context.centres.includes(centre),
    ),
  );
  const relations = new Map(
    [...(graph.bondToDoubleBondRelation ?? [])].filter(([key]) =>
      context.doubleBonds.includes(key),
    ),
  );
  const display = productDisplay(context);
  const fields = questionDrawingFields(
    context.toGraph,
    display,
    { centres: context.centres, doubleBonds: context.doubleBonds },
    { marks, relations },
  );
  const drawing = drawState(
    context.toGraph,
    {
      ...context.toState,
      mapNumberToCoordinates: fields.coordinates,
      bondToWedgeStyle: fields.wedges,
    },
    pixelsPerUnit,
  );
  const targets = questionTargets(
    drawing,
    { questionCentres: context.centres, questionDoubleBonds: context.doubleBonds },
    { isCentreSet: (centre) => marks.has(centre), isBondSet: (key) => relations.has(key) },
  );
  return { drawing, targets };
}
