/**
 * Where the electrons of a picked source can go, as places on the drawing (point and snap,
 * decided 2026-11-26, build item 10g; docs/SPEC.md §3). The canvas previews the one nearest the
 * pointer as a ghost arrow and commits it on a click; on touch, the new bonds are drawn as faint
 * dashed lines and a tap takes the nearest place.
 *
 * Places
 *   atom, bond   every atom and bond pick target that arrowPicking.ts accepts as a destination
 *   new bond     each bond of newBondDestinations.ts whose atoms are drawn (and tappable) within
 *                NEW_BOND_REACH bond lengths of each other, or that is a 1,2-shift (always shown:
 *                however it is drawn, it lands two bonds away)
 * The nearest place is measured to its centre: the atom, the bond's midpoint, the new bond's
 * midpoint. So a tap on an atom means the atom, and a tap in the middle of a dashed line means
 * that new bond, even where the two are close (re-aromatisation, docs/SPEC.md §3 "To monitor").
 */
import type {
  AtomLabel,
  BondLocus,
  CurvedArrow,
  ElectronLocus,
} from "../arrowNotation/curvedArrowNotation.js";
import { type DrawnCurvedArrow, drawCurvedArrow } from "../moleculeDrawing/curvedArrowGeometry.js";
import { BOND_LENGTH_PIXELS } from "../moleculeDrawing/drawingLayout.js";
import { type Point, distanceBetween, pointBetween } from "../moleculeDrawing/planeGeometry.js";
import {
  type PickTarget,
  type StateDrawing,
  drawnAtomOf,
} from "../moleculeDrawing/stateDrawing.js";
import { type StateGraph, bondKey } from "../stateGraphs/stateGraph.js";
import {
  type ArrowType,
  type TappedPlace,
  electronsMovedBy,
  tapToDestinationLocus,
} from "./arrowPicking.js";
import { newBondDestinations } from "./newBondDestinations.js";

/** New bonds between atoms drawn further apart than this many bond lengths are not offered. */
export const NEW_BOND_REACH = 2.1;
/** A pointer further than this from every place points at none. */
export const NEAREST_PLACE_PIXELS = 0.8 * BOND_LENGTH_PIXELS;
const NEW_BOND_TARGET_RADIUS = 12;
/** How much of each end of a dashed new bond is left out, clear of the atom labels. */
const NEW_BOND_LINE_TRIM = 0.22;

export interface DestinationTarget {
  /** An atom or bond pick target of the drawing, or a "newBond" one made here. */
  readonly target: PickTarget;
  readonly destination: ElectronLocus;
  /** The arrow this destination would draw, for the ghost preview. */
  readonly preview: DrawnCurvedArrow;
  /** For a new bond: its dashed line, trimmed clear of the two atoms' labels. */
  readonly newBondLine: { readonly start: Point; readonly end: Point } | null;
}

export interface PickedSource {
  readonly source: ElectronLocus;
  readonly arrowType: ArrowType;
  readonly drawnArrows: readonly CurvedArrow[];
}

function placeOf(target: PickTarget): TappedPlace | null {
  const [first = 0, second = 0] = target.mapNumbers;
  if (target.targetKind === "bond" || target.targetKind === "newBond") {
    return { placeKind: target.targetKind, mapNumbers: [first, second] };
  }
  return target.targetKind === "atom" ? { placeKind: "atom", mapNumber: first } : null;
}

function withPreview(
  drawing: StateDrawing,
  picked: PickedSource,
  target: PickTarget,
  destination: ElectronLocus,
): Omit<DestinationTarget, "newBondLine"> {
  const curvedArrow: CurvedArrow = {
    source: picked.source,
    destination,
    electronsMoved: electronsMovedBy(picked.arrowType),
  };
  return { target, destination, preview: drawCurvedArrow(drawing, curvedArrow) };
}

function newBondTarget(
  drawing: StateDrawing,
  picked: PickedSource,
  destination: BondLocus,
): DestinationTarget {
  const [first, second] = destination.atoms;
  const start = drawnAtomOf(drawing, first.mapNumber).point;
  const end = drawnAtomOf(drawing, second.mapNumber).point;
  const atomName = (atom: AtomLabel): string => `${atom.element}${String(atom.mapNumber)}`;
  const target: PickTarget = {
    pickTargetId: `newBond:${bondKey(first.mapNumber, second.mapNumber)}`,
    targetKind: "newBond",
    mapNumbers: [first.mapNumber, second.mapNumber],
    center: pointBetween(start, end, 0.5),
    radius: NEW_BOND_TARGET_RADIUS,
    accessibleName: `new bond ${atomName(first)}–${atomName(second)}`,
  };
  return {
    ...withPreview(drawing, picked, target, destination),
    newBondLine: {
      start: pointBetween(start, end, NEW_BOND_LINE_TRIM),
      end: pointBetween(start, end, 1 - NEW_BOND_LINE_TRIM),
    },
  };
}

function isShownNewBond(
  drawing: StateDrawing,
  graph: StateGraph,
  source: ElectronLocus,
  destination: BondLocus,
): boolean {
  const tappable = new Set(
    drawing.pickTargets
      .filter((target) => target.targetKind === "atom")
      .flatMap((target) => target.mapNumbers),
  );
  const [first, second] = destination.atoms.map((atom) => atom.mapNumber) as [number, number];
  if (!tappable.has(first) || !tappable.has(second)) {
    return false;
  }
  const sourceAtoms = source.atoms.map((atom) => atom.mapNumber);
  const isShift = [first, second].some(
    (end) =>
      !sourceAtoms.includes(end) &&
      sourceAtoms.some((sourceAtom) => graph.bondToOrder.has(bondKey(sourceAtom, end))),
  );
  const drawnLength = distanceBetween(
    drawnAtomOf(drawing, first).point,
    drawnAtomOf(drawing, second).point,
  );
  return isShift || drawnLength <= NEW_BOND_REACH * BOND_LENGTH_PIXELS;
}

/** Every place the picked source's electrons can go on this drawing. */
export function destinationTargets(
  drawing: StateDrawing,
  graph: StateGraph,
  picked: PickedSource,
): DestinationTarget[] {
  const drawnPlaces = drawing.pickTargets.flatMap((target) => {
    const place = placeOf(target);
    if (place === null) {
      return [];
    }
    const pick = tapToDestinationLocus(graph, picked.source, place, picked.arrowType);
    return pick.pickOutcome === "destination"
      ? [{ ...withPreview(drawing, picked, target, pick.destination), newBondLine: null }]
      : [];
  });
  const newBonds = newBondDestinations(graph, picked.source, picked.drawnArrows)
    .filter((destination) => isShownNewBond(drawing, graph, picked.source, destination))
    .map((destination) => newBondTarget(drawing, picked, destination));
  return [...drawnPlaces, ...newBonds];
}

/** The place nearest `point` (by its centre), or null if none is within NEAREST_PLACE_PIXELS. */
export function nearestDestinationTarget(
  targets: readonly DestinationTarget[],
  point: Point,
): DestinationTarget | null {
  let nearest: DestinationTarget | null = null;
  let nearestDistance = NEAREST_PLACE_PIXELS;
  for (const candidate of targets) {
    const distance = distanceBetween(candidate.target.center, point);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}
