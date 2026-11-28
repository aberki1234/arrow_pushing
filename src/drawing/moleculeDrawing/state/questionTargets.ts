/**
 * The tap targets of a stereo question (docs/stereo-question.md) on a drawn product: one per
 * question centre (at the atom) and per question double bond (at the bond's middle). Shared by the
 * learner screen and Create's authoring.
 */
import { bondKeyMapNumbers } from "../../../core/stateGraphs/stateGraph.js";
import type { Point } from "../shared/planeGeometry.js";
import type { StateDrawing } from "./stateDrawing.js";

export interface QuestionTarget {
  /** "centre-<map number>" or "bond-<bond key>". */
  readonly targetId: string;
  readonly point: Point;
  readonly isSet: boolean;
  readonly accessibleName: string;
}

/** The targets for `question`'s centres and double bonds, set or not as the callbacks say. */
export function questionTargets(
  drawing: StateDrawing,
  question: {
    readonly questionCentres: readonly number[];
    readonly questionDoubleBonds: readonly string[];
  },
  isSet: {
    readonly isCentreSet: (centre: number) => boolean;
    readonly isBondSet: (bondKey: string) => boolean;
  },
): QuestionTarget[] {
  const atomOf = (mapNumber: number): StateDrawing["atoms"][number] | undefined =>
    drawing.atoms.find((drawnAtom) => drawnAtom.mapNumber === mapNumber);
  const pointOf = (mapNumber: number): Point => atomOf(mapNumber)?.point ?? { x: 0, y: 0 };
  const nameOf = (mapNumber: number): string =>
    `${atomOf(mapNumber)?.element ?? ""}${String(mapNumber)}`;
  return [
    ...question.questionCentres.map((centre) => ({
      targetId: `centre-${String(centre)}`,
      point: pointOf(centre),
      isSet: isSet.isCentreSet(centre),
      accessibleName: `stereocentre ${nameOf(centre)}`,
    })),
    ...question.questionDoubleBonds.map((key) => {
      const [first, second] = bondKeyMapNumbers(key);
      const [start, end] = [pointOf(first), pointOf(second)];
      return {
        targetId: `bond-${key}`,
        point: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
        isSet: isSet.isBondSet(key),
        accessibleName: `double bond ${nameOf(first)}=${nameOf(second)}`,
      };
    }),
  ];
}
