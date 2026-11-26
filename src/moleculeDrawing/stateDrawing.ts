/**
 * Everything drawn for one state: atom labels, bond lines, electron dots, annotations, the
 * caption and the pick targets the learner taps, worked out from the state graph and the state's
 * stored coordinates. Pure data: the Svelte canvas only renders it.
 *
 * Terms
 *   pick target  A place the learner can tap: an atom, a bond, one lone pair or an unpaired
 *                electron. One target per bond (decided 2026-11-25); whether a bond source means
 *                its σ or π electrons is decided by the step session, not here.
 *   spectator    An atom drawn faded and never picked (Na⁺, MgBr⁺).
 */
import {
  type StateAtom,
  type StateGraph,
  bondKeyMapNumbers,
  formalCharge,
  lonePairCount,
  unpairedElectronCount,
} from "../stateGraphs/stateGraph.js";
import {
  type AbbreviatedGroup,
  type StateDisplayPlan,
  stateDisplayPlan,
} from "./abbreviatedGroups.js";
import { type AtomLabelText, atomLabelText } from "./atomLabels.js";
import { type BondLines, type WedgeStyle, bondLines } from "./bondLines.js";
import {
  type MapNumberToCoordinates,
  type ViewBox,
  screenPoints,
  viewBoxAround,
} from "./drawingLayout.js";
import { type ElectronDotKind, placeElectronDots } from "./electronDotPlacement.js";
import {
  CHARGE_DIRECTION,
  HYDROGEN_SIDE_TO_ANGLE,
  type LabelTextPlacement,
  annotationPoint,
  labelEnds,
  labelTextPlacement,
} from "./labelPlacement.js";
import { type Point, angleFrom, pointAtAngle } from "./planeGeometry.js";

export const ATOM_TARGET_RADIUS = 16;
export const BOND_TARGET_RADIUS = 13;
export const ELECTRON_TARGET_RADIUS = 10;
/** How far an electron dot sits from its atom's centre. */
export const ELECTRON_DOT_DISTANCE = 15;
/** Half the gap between the two dots of a lone pair. */
export const LONE_PAIR_HALF_GAP = 3.2;
export const VIEW_BOX_PADDING = 34;
/** What the drawing needs from a state record of the reaction file. */
export interface StateDisplayFields {
  readonly mapNumberToCoordinates: MapNumberToCoordinates;
  readonly mapNumberToLonePairAnglesDegrees?: Readonly<Record<string, readonly number[]>>;
  readonly bondToWedgeStyle?: Readonly<Record<string, WedgeStyle>>;
  readonly annotations?: readonly { readonly text: string; readonly nearMapNumber: number }[];
  readonly caption?: string;
}

export type { AbbreviatedGroup } from "./abbreviatedGroups.js";
export {
  ANNOTATION_DISTANCE,
  CHARGE_DIRECTION,
  CHARGE_RISE,
  HYDROGEN_ROW_OFFSET,
  LABEL_CHARACTER_WIDTH,
} from "./labelPlacement.js";

/** Reaction-level drawing settings, the same in every state. */
export interface ReactionDisplayFields {
  /** Drawn faded, never picked (Na⁺, MgBr⁺). */
  readonly spectatorMapNumbers?: readonly number[];
  /** Drawn as their label wherever intact; nothing in them is picked. */
  readonly abbreviatedGroups?: readonly AbbreviatedGroup[];
}

export interface DrawnAtom extends LabelTextPlacement {
  readonly mapNumber: number;
  readonly element: string;
  readonly point: Point;
  readonly labelText: AtomLabelText;
  readonly isSpectator: boolean;
}

export interface DrawnBond {
  readonly mapNumbers: readonly [number, number];
  readonly bondOrder: number;
  readonly bondLines: BondLines;
  readonly isSpectator: boolean;
}

/** One lone pair (two dots) or one unpaired electron (one dot). */
export interface DrawnElectronDot {
  readonly dotKind: ElectronDotKind;
  readonly mapNumber: number;
  /** Radians, screen axes. */
  readonly angle: number;
  readonly center: Point;
  readonly dotPoints: readonly Point[];
}

export interface DrawnAnnotation {
  readonly text: string;
  readonly point: Point;
}

/** "newBond": a bond not drawn yet, offered as a destination (stepSession/destinationTargets). */
export type PickTargetKind = "atom" | "bond" | "lonePair" | "unpairedElectron" | "newBond";

export interface PickTarget {
  /** Unique in the drawing, e.g. "atom:3", "bond:2-3", "lonePair:1:0", "unpairedElectron:5". */
  readonly pickTargetId: string;
  readonly targetKind: PickTargetKind;
  /** One map number, or two for a bond (ascending). */
  readonly mapNumbers: readonly number[];
  readonly center: Point;
  readonly radius: number;
  /** For screen readers, e.g. "lone pair on O1", "bond C2–Br3". */
  readonly accessibleName: string;
}

export interface StateDrawing {
  readonly atoms: readonly DrawnAtom[];
  readonly bonds: readonly DrawnBond[];
  readonly electronDots: readonly DrawnElectronDot[];
  readonly annotations: readonly DrawnAnnotation[];
  readonly caption: string;
  /**
   * Atoms, then bonds, then electron dots: the order to draw them in, so the small electron
   * targets sit on top of the atom targets they overlap.
   */
  readonly pickTargets: readonly PickTarget[];
  readonly viewBox: ViewBox;
  /** The centre of the non-spectator atoms, used to bend curved arrows outward. */
  readonly centroid: Point;
}

interface AtomSurroundings {
  readonly bondAngles: number[];
  readonly occupiedAngles: number[];
}

function surroundingsOf(
  graph: StateGraph,
  mapNumber: number,
  mapNumberToPoint: ReadonlyMap<number, Point>,
  labelText: AtomLabelText | null,
): AtomSurroundings {
  const point = pointOf(mapNumberToPoint, mapNumber);
  const bondAngles = neighboursOf(graph, mapNumber).map((neighbour) =>
    angleFrom(point, pointOf(mapNumberToPoint, neighbour)),
  );
  const occupiedAngles = [...bondAngles];
  if (labelText !== null && labelText.hydrogenText !== "") {
    occupiedAngles.push(HYDROGEN_SIDE_TO_ANGLE[labelText.hydrogenSide]);
  }
  if (labelText !== null && labelText.chargeText !== "") {
    occupiedAngles.push(CHARGE_DIRECTION);
  }
  return { bondAngles, occupiedAngles };
}

function pointOf(mapNumberToPoint: ReadonlyMap<number, Point>, mapNumber: number): Point {
  const point = mapNumberToPoint.get(mapNumber);
  if (point === undefined) {
    throw new Error(`the state has no coordinates for map number ${String(mapNumber)}`);
  }
  return point;
}

function neighboursOf(graph: StateGraph, mapNumber: number): number[] {
  const neighbours: number[] = [];
  for (const key of graph.bondToOrder.keys()) {
    const [first, second] = bondKeyMapNumbers(key);
    if (first === mapNumber) {
      neighbours.push(second);
    } else if (second === mapNumber) {
      neighbours.push(first);
    }
  }
  return neighbours;
}

function atomName(atom: StateAtom): string {
  return `${atom.element}${String(atom.mapNumber)}`;
}

function drawnElectronDots(
  atom: StateAtom,
  point: Point,
  occupiedAngles: readonly number[],
  authoredDegrees: readonly number[],
): DrawnElectronDot[] {
  return placeElectronDots(
    occupiedAngles,
    lonePairCount(atom),
    unpairedElectronCount(atom),
    authoredDegrees,
  ).map(({ dotKind, angle }) => {
    const center = pointAtAngle(point, angle, ELECTRON_DOT_DISTANCE);
    const across = angle + Math.PI / 2;
    const dotPoints =
      dotKind === "lonePair"
        ? [
            pointAtAngle(center, across, LONE_PAIR_HALF_GAP),
            pointAtAngle(center, across, -LONE_PAIR_HALF_GAP),
          ]
        : [center];
    return { dotKind, mapNumber: atom.mapNumber, angle, center, dotPoints };
  });
}

interface DrawnParts {
  readonly atoms: DrawnAtom[];
  readonly bonds: DrawnBond[];
  readonly electronDots: DrawnElectronDot[];
  readonly annotations: DrawnAnnotation[];
}

function wedgeFor(
  displayFields: StateDisplayFields,
  first: number,
  second: number,
): { style: WedgeStyle; reversed: boolean } | null {
  const table = displayFields.bondToWedgeStyle ?? {};
  const forward = `${String(first)}-${String(second)}`;
  const backward = `${String(second)}-${String(first)}`;
  if (Object.hasOwn(table, forward)) {
    return { style: table[forward] as WedgeStyle, reversed: false };
  }
  return Object.hasOwn(table, backward)
    ? { style: table[backward] as WedgeStyle, reversed: true }
    : null;
}

function drawnBondsOf(
  graph: StateGraph,
  displayFields: StateDisplayFields,
  mapNumberToPoint: ReadonlyMap<number, Point>,
  plan: StateDisplayPlan,
): DrawnBond[] {
  return [...graph.bondToOrder.entries()]
    .map(([key, bondOrder]) => ({ mapNumbers: bondKeyMapNumbers(key), bondOrder }))
    .filter(({ mapNumbers }) => !mapNumbers.some((atom) => plan.hiddenMapNumbers.has(atom)))
    .sort(
      (one, other) =>
        one.mapNumbers[0] - other.mapNumbers[0] || one.mapNumbers[1] - other.mapNumbers[1],
    )
    .map(({ mapNumbers, bondOrder }) => {
      const [first, second] = mapNumbers;
      const wedge = wedgeFor(displayFields, first, second);
      const [from, to] = wedge?.reversed === true ? [second, first] : [first, second];
      return {
        mapNumbers,
        bondOrder,
        bondLines: bondLines(
          pointOf(mapNumberToPoint, from),
          pointOf(mapNumberToPoint, to),
          bondOrder,
          wedge?.style ?? null,
        ),
        isSpectator: plan.spectatorMapNumbers.has(first) || plan.spectatorMapNumbers.has(second),
      };
    });
}

/** The atom's label: its group's label for an intact group's attachment atom. */
function labelTextOf(
  graph: StateGraph,
  atom: StateAtom,
  bondAngles: readonly number[],
  plan: StateDisplayPlan,
): AtomLabelText {
  const groupLabel = plan.mapNumberToGroupLabel.get(atom.mapNumber);
  if (groupLabel !== undefined) {
    return { element: groupLabel, hydrogenText: "", hydrogenSide: "right", chargeText: "" };
  }
  return atomLabelText(
    atom.element,
    atom.hydrogenCount,
    formalCharge(graph, atom.mapNumber),
    bondAngles,
  );
}

function drawnPartsOf(
  graph: StateGraph,
  displayFields: StateDisplayFields,
  mapNumberToPoint: ReadonlyMap<number, Point>,
  plan: StateDisplayPlan,
): DrawnParts {
  const atoms: DrawnAtom[] = [];
  const electronDots: DrawnElectronDot[] = [];
  const annotations: DrawnAnnotation[] = [];
  const atomsInOrder = [...graph.mapNumberToAtom.values()]
    .filter((atom) => !plan.hiddenMapNumbers.has(atom.mapNumber))
    .sort((one, other) => one.mapNumber - other.mapNumber);
  for (const atom of atomsInOrder) {
    const point = pointOf(mapNumberToPoint, atom.mapNumber);
    const bareSurroundings = surroundingsOf(graph, atom.mapNumber, mapNumberToPoint, null);
    const labelText = labelTextOf(graph, atom, bareSurroundings.bondAngles, plan);
    const { occupiedAngles } = surroundingsOf(graph, atom.mapNumber, mapNumberToPoint, labelText);
    const authored = displayFields.mapNumberToLonePairAnglesDegrees?.[String(atom.mapNumber)] ?? [];
    const dots = plan.mapNumberToGroupLabel.has(atom.mapNumber)
      ? []
      : drawnElectronDots(atom, point, occupiedAngles, authored);
    electronDots.push(...dots);
    atoms.push({
      mapNumber: atom.mapNumber,
      element: atom.element,
      point,
      labelText,
      ...labelTextPlacement(point, labelText),
      isSpectator: plan.spectatorMapNumbers.has(atom.mapNumber),
    });
    for (const annotation of displayFields.annotations ?? []) {
      if (annotation.nearMapNumber === atom.mapNumber) {
        const taken = [...occupiedAngles, ...dots.map((dot) => dot.angle)];
        annotations.push({ text: annotation.text, point: annotationPoint(point, taken) });
      }
    }
  }
  return {
    atoms,
    bonds: drawnBondsOf(graph, displayFields, mapNumberToPoint, plan),
    electronDots,
    annotations,
  };
}

function electronTargetsOf(
  dots: readonly DrawnElectronDot[],
  liveAtoms: ReadonlySet<number>,
  nameOf: (mapNumber: number) => string,
): PickTarget[] {
  const lonePairCounter = new Map<number, number>();
  return dots
    .filter((dot) => liveAtoms.has(dot.mapNumber))
    .sort((one, other) => one.mapNumber - other.mapNumber)
    .map((dot): PickTarget => {
      const common = {
        mapNumbers: [dot.mapNumber],
        center: dot.center,
        radius: ELECTRON_TARGET_RADIUS,
      };
      if (dot.dotKind === "unpairedElectron") {
        return {
          ...common,
          pickTargetId: `unpairedElectron:${String(dot.mapNumber)}`,
          targetKind: "unpairedElectron",
          accessibleName: `unpaired electron on ${nameOf(dot.mapNumber)}`,
        };
      }
      const index = lonePairCounter.get(dot.mapNumber) ?? 0;
      lonePairCounter.set(dot.mapNumber, index + 1);
      return {
        ...common,
        pickTargetId: `lonePair:${String(dot.mapNumber)}:${String(index)}`,
        targetKind: "lonePair",
        accessibleName: `lone pair on ${nameOf(dot.mapNumber)}`,
      };
    });
}

function pickTargetsOf(graph: StateGraph, parts: DrawnParts, plan: StateDisplayPlan): PickTarget[] {
  const nameOf = (mapNumber: number): string => {
    const atom = graph.mapNumberToAtom.get(mapNumber);
    return atom === undefined ? String(mapNumber) : atomName(atom);
  };
  const tappable = (mapNumber: number): boolean => !plan.untappableMapNumbers.has(mapNumber);
  const liveAtoms = new Set(
    parts.atoms.map((atom) => atom.mapNumber).filter((mapNumber) => tappable(mapNumber)),
  );
  const bondTargets = parts.bonds
    .filter((bond) => bond.mapNumbers.every(tappable))
    .map((bond): PickTarget => ({
      pickTargetId: `bond:${bond.mapNumbers.join("-")}`,
      targetKind: "bond",
      mapNumbers: bond.mapNumbers,
      center: bond.bondLines.midpoint,
      radius: BOND_TARGET_RADIUS,
      accessibleName: `bond ${nameOf(bond.mapNumbers[0])}–${nameOf(bond.mapNumbers[1])}`,
    }));
  const atomTargets = parts.atoms
    .filter((atom) => tappable(atom.mapNumber))
    .map((atom): PickTarget => ({
      pickTargetId: `atom:${String(atom.mapNumber)}`,
      targetKind: "atom",
      mapNumbers: [atom.mapNumber],
      center: atom.point,
      radius: ATOM_TARGET_RADIUS,
      accessibleName: nameOf(atom.mapNumber),
    }));
  return [
    ...atomTargets,
    ...bondTargets,
    ...electronTargetsOf(parts.electronDots, liveAtoms, nameOf),
  ];
}

function centroidOf(atoms: readonly DrawnAtom[]): Point {
  const live = atoms.filter((atom) => !atom.isSpectator);
  const counted = live.length > 0 ? live : atoms;
  const count = Math.max(counted.length, 1);
  return {
    x: counted.reduce((sum, atom) => sum + atom.point.x, 0) / count,
    y: counted.reduce((sum, atom) => sum + atom.point.y, 0) / count,
  };
}

export function drawState(
  graph: StateGraph,
  displayFields: StateDisplayFields,
  scale: number,
  reactionDisplay: ReactionDisplayFields = {},
): StateDrawing {
  const mapNumberToPoint = screenPoints(displayFields.mapNumberToCoordinates, scale);
  const plan = stateDisplayPlan(
    graph,
    reactionDisplay.spectatorMapNumbers ?? [],
    reactionDisplay.abbreviatedGroups ?? [],
  );
  const parts = drawnPartsOf(graph, displayFields, mapNumberToPoint, plan);
  const boxedPoints = [
    ...parts.atoms.flatMap((atom) => labelEnds(atom.point, atom.labelText)),
    ...parts.electronDots.map((dot) => dot.center),
    ...parts.annotations.map((annotation) => annotation.point),
  ];
  return {
    ...parts,
    caption: displayFields.caption ?? "",
    pickTargets: pickTargetsOf(graph, parts, plan),
    viewBox: viewBoxAround(boxedPoints, VIEW_BOX_PADDING),
    centroid: centroidOf(parts.atoms),
  };
}

/** The atom drawn with `mapNumber`; throws if the drawing has none. */
export function drawnAtomOf(drawing: StateDrawing, mapNumber: number): DrawnAtom {
  const atom = drawing.atoms.find((candidate) => candidate.mapNumber === mapNumber);
  if (atom === undefined) {
    throw new Error(`the drawing has no atom with map number ${String(mapNumber)}`);
  }
  return atom;
}
