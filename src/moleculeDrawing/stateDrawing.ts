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
import { type AtomLabelText, atomLabelText } from "./atomLabels.js";
import { type BondLines, type WedgeStyle, bondLines } from "./bondLines.js";
import {
  type MapNumberToCoordinates,
  type ViewBox,
  screenPoints,
  viewBoxAround,
} from "./drawingLayout.js";
import { type ElectronDotKind, placeElectronDots, widestGapAngle } from "./electronDotPlacement.js";
import { type Point, angleFrom, pointAtAngle } from "./planeGeometry.js";

export const ATOM_TARGET_RADIUS = 16;
export const BOND_TARGET_RADIUS = 13;
export const ELECTRON_TARGET_RADIUS = 10;
/** How far an electron dot sits from its atom's centre. */
export const ELECTRON_DOT_DISTANCE = 15;
/** Half the gap between the two dots of a lone pair. */
export const LONE_PAIR_HALF_GAP = 3.2;
export const VIEW_BOX_PADDING = 34;
/** How far an annotation sits from its atom. */
export const ANNOTATION_DISTANCE = 34;
/** Width of one label character at the label font (19 px); the canvas uses it too. */
export const LABEL_CHARACTER_WIDTH = 11;
/** The charge is written at the label's upper right: electron dots keep out of that way. */
export const CHARGE_DIRECTION = -Math.PI / 4;

/** What the drawing needs from a state record of the reaction file. */
export interface StateDisplayFields {
  readonly mapNumberToCoordinates: MapNumberToCoordinates;
  readonly mapNumberToLonePairAnglesDegrees?: Readonly<Record<string, readonly number[]>>;
  readonly bondToWedgeStyle?: Readonly<Record<string, WedgeStyle>>;
  readonly annotations?: readonly { readonly text: string; readonly nearMapNumber: number }[];
  readonly caption?: string;
}

export interface DrawnAtom {
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

export type PickTargetKind = "atom" | "bond" | "lonePair" | "unpairedElectron";

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
    occupiedAngles.push(labelText.hydrogenSide === "right" ? 0 : Math.PI);
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
  spectators: ReadonlySet<number>,
): DrawnBond[] {
  return [...graph.bondToOrder.entries()]
    .map(([key, bondOrder]) => ({ mapNumbers: bondKeyMapNumbers(key), bondOrder }))
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
        isSpectator: spectators.has(first) || spectators.has(second),
      };
    });
}

function drawnPartsOf(
  graph: StateGraph,
  displayFields: StateDisplayFields,
  mapNumberToPoint: ReadonlyMap<number, Point>,
  spectators: ReadonlySet<number>,
): DrawnParts {
  const atoms: DrawnAtom[] = [];
  const electronDots: DrawnElectronDot[] = [];
  const annotations: DrawnAnnotation[] = [];
  const atomsInOrder = [...graph.mapNumberToAtom.values()].sort(
    (one, other) => one.mapNumber - other.mapNumber,
  );
  for (const atom of atomsInOrder) {
    const point = pointOf(mapNumberToPoint, atom.mapNumber);
    const bareSurroundings = surroundingsOf(graph, atom.mapNumber, mapNumberToPoint, null);
    const labelText = atomLabelText(
      atom.element,
      atom.hydrogenCount,
      formalCharge(graph, atom.mapNumber),
      bareSurroundings.bondAngles,
    );
    const { occupiedAngles } = surroundingsOf(graph, atom.mapNumber, mapNumberToPoint, labelText);
    const authored = displayFields.mapNumberToLonePairAnglesDegrees?.[String(atom.mapNumber)] ?? [];
    const dots = drawnElectronDots(atom, point, occupiedAngles, authored);
    electronDots.push(...dots);
    atoms.push({
      mapNumber: atom.mapNumber,
      element: atom.element,
      point,
      labelText,
      isSpectator: spectators.has(atom.mapNumber),
    });
    for (const annotation of displayFields.annotations ?? []) {
      if (annotation.nearMapNumber === atom.mapNumber) {
        const freeAngle = widestGapAngle([...occupiedAngles, ...dots.map((dot) => dot.angle)]);
        annotations.push({
          text: annotation.text,
          point: pointAtAngle(point, freeAngle, ANNOTATION_DISTANCE),
        });
      }
    }
  }
  return {
    atoms,
    bonds: drawnBondsOf(graph, displayFields, mapNumberToPoint, spectators),
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

function pickTargetsOf(graph: StateGraph, parts: DrawnParts): PickTarget[] {
  const nameOf = (mapNumber: number): string => {
    const atom = graph.mapNumberToAtom.get(mapNumber);
    return atom === undefined ? String(mapNumber) : atomName(atom);
  };
  const liveAtoms = new Set(
    parts.atoms.filter((atom) => !atom.isSpectator).map((atom) => atom.mapNumber),
  );
  const bondTargets = parts.bonds
    .filter((bond) => !bond.isSpectator)
    .map((bond): PickTarget => ({
      pickTargetId: `bond:${bond.mapNumbers.join("-")}`,
      targetKind: "bond",
      mapNumbers: bond.mapNumbers,
      center: bond.bondLines.midpoint,
      radius: BOND_TARGET_RADIUS,
      accessibleName: `bond ${nameOf(bond.mapNumbers[0])}–${nameOf(bond.mapNumbers[1])}`,
    }));
  const atomTargets = parts.atoms
    .filter((atom) => !atom.isSpectator)
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

/** The left and right ends of an atom's label text, at the atom's height. */
function labelEnds(atom: DrawnAtom): Point[] {
  const { element, hydrogenText, hydrogenSide, chargeText } = atom.labelText;
  const halfElement = (element.length * LABEL_CHARACTER_WIDTH) / 2;
  const hydrogenWidth = hydrogenText.length * LABEL_CHARACTER_WIDTH;
  const left = atom.point.x - halfElement - (hydrogenSide === "left" ? hydrogenWidth : 0);
  const right =
    atom.point.x +
    halfElement +
    (hydrogenSide === "right" ? hydrogenWidth : 0) +
    chargeText.length * LABEL_CHARACTER_WIDTH;
  return [
    { x: left, y: atom.point.y },
    { x: right, y: atom.point.y },
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
  spectatorMapNumbers: readonly number[] = [],
): StateDrawing {
  const mapNumberToPoint = screenPoints(displayFields.mapNumberToCoordinates, scale);
  const parts = drawnPartsOf(graph, displayFields, mapNumberToPoint, new Set(spectatorMapNumbers));
  const boxedPoints = [
    ...parts.atoms.flatMap(labelEnds),
    ...parts.electronDots.map((dot) => dot.center),
    ...parts.annotations.map((annotation) => annotation.point),
  ];
  return {
    ...parts,
    caption: displayFields.caption ?? "",
    pickTargets: pickTargetsOf(graph, parts),
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
