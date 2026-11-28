/**
 * What the step screen shows during a stereo question (docs/stereo-question.md): the step's product
 * with each question centre as a tap target, drawn "?" until set, then with a wedge or a dash; a
 * question double bond drawn in line until set, then cis or trans.
 *
 * A tap on a centre draws a wedge or a dash on the bond the product's own drawing would wedge,
 * starting with `firstTap.wedgeStyle` and then switching. A tap on a double bond sets
 * `firstTap.relation`, then flips it. The screen chooses both at random, so the first tap never
 * gives the answer away.
 */
import { graphOf } from "../../../core/attemptAssessment/preparedReaction.js";
import type { DoubleBondRelation, StateGraph } from "../../../core/stateGraphs/stateGraph.js";
import {
  type BondToWedgeStyle,
  type WedgeStyle,
  markAfterTap,
} from "../../../drawing/moleculeDrawing/shared/stereoDrawing.js";
import {
  type QuestionDrawingFields,
  questionDrawingFields,
} from "../../../drawing/moleculeDrawing/shared/stereoQuestionDrawing.js";
import {
  type QuestionTarget,
  questionTargets,
} from "../../../drawing/moleculeDrawing/state/questionTargets.js";
import type { PreparedStereoQuestion } from "../../../core/stereoQuestions/stereoQuestions.js";
import {
  type StateDrawing,
  drawState,
} from "../../../drawing/moleculeDrawing/state/stateDrawing.js";
import {
  type StepSession,
  setQuestionCentreMark,
  setQuestionDoubleBond,
} from "../../stepSession/stepSession.js";

export type { QuestionTarget };

export interface StereoQuestionDrawing {
  readonly drawing: StateDrawing;
  readonly targets: readonly QuestionTarget[];
  /** The product's coordinates and wedges as drawn now (for tests and the screen's checks). */
  readonly coordinates: Readonly<Record<string, readonly number[]>>;
  readonly wedges: BondToWedgeStyle;
}

/** The product, the question, and how the learner's answer is drawn now. */
function questionContext(session: StepSession): {
  readonly graph: StateGraph;
  readonly productCoordinates: Readonly<Record<string, readonly number[]>>;
  readonly question: PreparedStereoQuestion;
  readonly fields: QuestionDrawingFields;
  readonly toStateId: string;
} {
  const step = session.currentStep;
  const question = step?.stereoQuestion;
  const state = step == null ? undefined : session.reaction.stateIdToState.get(step.toStateId);
  if (step == null || question == null || state === undefined) {
    throw new Error("no stereo question at this point of the run");
  }
  const graph = graphOf(session.reaction.prepared, step.toStateId);
  const fields = questionDrawingFields(
    graph,
    state.displayFields,
    { centres: question.questionCentres, doubleBonds: question.questionDoubleBonds },
    { marks: session.questionMarks, relations: session.questionRelations },
  );
  return {
    graph,
    productCoordinates: state.displayFields.mapNumberToCoordinates,
    question,
    fields,
    toStateId: step.toStateId,
  };
}

/** The product as the learner has drawn it so far, with its tap targets. */
export function stereoQuestionDrawing(session: StepSession, scale: number): StereoQuestionDrawing {
  const { graph, question, fields, toStateId } = questionContext(session);
  const state = session.reaction.stateIdToState.get(toStateId);
  const drawing = drawState(
    graph,
    {
      ...state?.displayFields,
      mapNumberToCoordinates: fields.coordinates,
      bondToWedgeStyle: fields.wedges,
    },
    scale,
    {
      spectatorMapNumbers: session.reaction.spectatorMapNumbers,
      abbreviatedGroups: session.reaction.abbreviatedGroups,
    },
  );
  const targets = questionTargets(drawing, question, {
    isCentreSet: (centre) => session.questionMarks.has(centre),
    isBondSet: (key) => session.questionRelations.has(key),
  });
  return { drawing, targets, coordinates: fields.coordinates, wedges: fields.wedges };
}

/** A tap on a question target (see the module comment). */
export function tapQuestionTarget(
  session: StepSession,
  targetId: string,
  firstTap: { readonly relation: DoubleBondRelation; readonly wedgeStyle: WedgeStyle },
): StepSession {
  if (targetId.startsWith("bond-")) {
    const key = targetId.slice("bond-".length);
    const current = session.questionRelations.get(key);
    const next: DoubleBondRelation =
      current === undefined ? firstTap.relation : current === "cis" ? "trans" : "cis";
    return setQuestionDoubleBond(session, key, next);
  }
  const centre = Number(targetId.slice("centre-".length));
  const { graph, productCoordinates, fields } = questionContext(session);
  const wedgeBond = fields.centreToWedgeBond.get(centre);
  const mark =
    wedgeBond === undefined
      ? undefined
      : markAfterTap(
          graph,
          productCoordinates,
          wedgeBond,
          session.questionMarks.get(centre),
          firstTap.wedgeStyle,
        );
  return mark === undefined ? session : setQuestionCentreMark(session, centre, mark);
}
