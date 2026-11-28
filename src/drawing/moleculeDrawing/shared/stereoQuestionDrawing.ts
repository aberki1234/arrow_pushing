/**
 * How a stereo question's product is drawn (docs/stereo-question.md), for the learner screen and
 * for Create's authoring: the product's own layout, its fixed wedges, and at each question centre
 * a wedge or dash on one chosen bond showing the configuration given (none while unset); each
 * question double bond drawn with the relation given, or in line while unset.
 */
import {
  bondKeyMapNumbers,
  type DoubleBondRelation,
  type StateGraph,
  type TetrahedralMark,
} from "../../../core/stateGraphs/stateGraph.js";
import type { MapNumberToCoordinates } from "./drawingLayout.js";
import {
  type BondToWedgeStyle,
  type WedgeStyle,
  coordinatesWithDoubleBond,
  wedgeStyleForMark,
  wedgesForMarks,
} from "./stereoDrawing.js";

export interface QuestionDrawingFields {
  readonly coordinates: Record<string, number[]>;
  readonly wedges: Record<string, WedgeStyle>;
  /** The bond ("<centre>-<neighbour>") each question centre's wedge or dash goes on. */
  readonly centreToWedgeBond: ReadonlyMap<number, string>;
}

/**
 * The drawing fields for the product `productGraph` (with its own marks) as drawn in `product`,
 * showing `marks` at `centres` and `relations` at `doubleBonds` instead of the product's own.
 */
export function questionDrawingFields(
  productGraph: StateGraph,
  product: {
    readonly mapNumberToCoordinates: MapNumberToCoordinates;
    readonly bondToWedgeStyle?: BondToWedgeStyle;
  },
  question: { readonly centres: readonly number[]; readonly doubleBonds: readonly string[] },
  shown: {
    readonly marks: ReadonlyMap<number, TetrahedralMark>;
    readonly relations: ReadonlyMap<string, DoubleBondRelation>;
  },
): QuestionDrawingFields {
  const productWedges = wedgesForMarks(
    productGraph,
    product.mapNumberToCoordinates,
    product.bondToWedgeStyle ?? {},
  );
  const centreToWedgeBond = new Map(
    question.centres.flatMap((centre) => {
      const key = Object.keys(productWedges).find((wedgeKey) =>
        wedgeKey.startsWith(`${String(centre)}-`),
      );
      return key === undefined ? [] : [[centre, key] as const];
    }),
  );
  const wedges: Record<string, WedgeStyle> = Object.fromEntries(
    Object.entries(productWedges).filter(
      ([key]) => !question.centres.includes(bondKeyMapNumbers(key)[0]),
    ),
  );
  for (const [centre, wedgeBond] of centreToWedgeBond) {
    const mark = shown.marks.get(centre);
    if (mark !== undefined) {
      wedges[wedgeBond] = wedgeStyleForMark(
        productGraph,
        product.mapNumberToCoordinates,
        wedgeBond,
        mark,
      );
    }
  }
  const coordinates = question.doubleBonds.reduce<Record<string, number[]>>(
    (current, key) =>
      coordinatesWithDoubleBond(productGraph, current, key, shown.relations.get(key) ?? null),
    Object.fromEntries(
      Object.entries(product.mapNumberToCoordinates).map(([key, point]) => [key, [...point]]),
    ),
  );
  return { coordinates, wedges, centreToWedgeBond };
}
