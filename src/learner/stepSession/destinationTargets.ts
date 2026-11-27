/**
 * Where the electrons of a picked source can go, as places on the drawing (point and snap,
 * decided 2026-11-26, build item 10g; docs/SPEC.md §3). The canvas previews the one nearest the
 * pointer as a ghost arrow and commits it on a click; on touch, the new bonds are drawn as faint
 * dashed lines and a tap takes the nearest place.
 *
 * Places
 *   atom, bond   every atom and bond pick target that arrowPicking.ts accepts as a destination
 *   new bond     each bond of newBondDestinations.ts between tappable atoms: always to another
 *                molecule (molecules are laid out apart, so distance says nothing), to an H (a
 *                proton passed across, however the molecule is drawn) and for a 1,2-shift; a
 *                ring closure only within NEW_BOND_REACH bond lengths
 * The nearest place is measured to its anchors: the atom; the bond's midpoint; the new bond's
 * midpoint and its far atom (the one not in the source), so pointing at the atom the electrons
 * go to picks the new bond to it, from the nearer end of the source bond. Atoms and bonds come
 * first and win a tie, so an atom that is a place itself keeps its meaning (except an atom a
 * 1,2-shift lands on: there the atom means the shift and the π bond is the bond's middle), and
 * a tap in the middle of a dashed line means that new bond even where the two are close
 * (re-aromatisation, docs/SPEC.md §3 "To monitor").
 */
import type {
  AtomLabel,
  BondLocus,
  CurvedArrow,
  ElectronLocus,
} from "../../core/arrowNotation/curvedArrowNotation.js";
import {
  type DrawnCurvedArrow,
  drawCurvedArrow,
} from "../../drawing/moleculeDrawing/curvedArrowGeometry.js";
import { BOND_LENGTH_PIXELS } from "../../drawing/moleculeDrawing/drawingLayout.js";
import {
  type Point,
  distanceBetween,
  pointBetween,
} from "../../drawing/moleculeDrawing/planeGeometry.js";
import {
  type PickTarget,
  type StateDrawing,
  drawnAtomOf,
} from "../../drawing/moleculeDrawing/stateDrawing.js";
import { type StateGraph, bondKey, bondKeyMapNumbers } from "../../core/stateGraphs/stateGraph.js";
import {
  type ArrowType,
  type TappedPlace,
  electronsMovedBy,
  tapToDestinationLocus,
} from "./arrowPicking.js";
import { newBondDestinations } from "./newBondDestinations.js";

/** Ring closures between atoms drawn further apart than this many bond lengths are not offered. */
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
  /** Where pointing picks this place: its centre, and for a new bond also its far atom. */
  readonly anchors: readonly Point[];
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
): Omit<DestinationTarget, "newBondLine" | "anchors"> {
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
  const sourceAtoms = picked.source.atoms.map((atom) => atom.mapNumber);
  const farAtom = sourceAtoms.includes(first.mapNumber) ? end : start;
  return {
    ...withPreview(drawing, picked, target, destination),
    newBondLine: {
      start: pointBetween(start, end, NEW_BOND_LINE_TRIM),
      end: pointBetween(start, end, 1 - NEW_BOND_LINE_TRIM),
    },
    anchors: [target.center, farAtom],
  };
}

/** Whether two atoms are in the same molecule (joined by bonds). */
function sameMolecule(graph: StateGraph, first: number, second: number): boolean {
  const reached = new Set([first]);
  const queue = [first];
  for (let current = queue.shift(); current !== undefined; current = queue.shift()) {
    for (const key of graph.bondToOrder.keys()) {
      const [atomA, atomB] = bondKeyMapNumbers(key);
      const next = atomA === current ? atomB : atomB === current ? atomA : undefined;
      if (next !== undefined && !reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
    }
  }
  return reached.has(second);
}

/**
 * Whether a new bond is shown: both atoms tappable, and either in different molecules (however
 * far apart they are drawn: molecules are laid out apart), to an H, a 1,2-shift, or a ring
 * closure drawn within NEW_BOND_REACH bond lengths.
 */
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
  const isProtonTransfer = destination.atoms.some((atom) => atom.element === "H");
  if (!sameMolecule(graph, first, second) || isProtonTransfer) {
    return true;
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

function locusKey(locus: ElectronLocus): string {
  return `${locus.locusKind}:${locus.atoms.map((atom) => String(atom.mapNumber)).join("-")}`;
}

/** Shorter new bonds first: pointing at a far atom picks the bond from the nearer source atom. */
function newBondLength(place: DestinationTarget): number {
  return place.newBondLine === null
    ? 0
    : distanceBetween(place.newBondLine.start, place.newBondLine.end);
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
    const pick = tapToDestinationLocus(
      graph,
      picked.source,
      place,
      picked.arrowType,
      picked.drawnArrows,
    );
    return pick.pickOutcome === "destination"
      ? [
          {
            ...withPreview(drawing, picked, target, pick.destination),
            newBondLine: null,
            anchors: [target.center],
          },
        ]
      : [];
  });
  const newBonds = newBondDestinations(graph, picked.source, picked.drawnArrows)
    .filter((destination) => isShownNewBond(drawing, graph, picked.source, destination))
    .map((destination) => newBondTarget(drawing, picked, destination))
    .sort((first, second) => newBondLength(first) - newBondLength(second));
  // An atom whose meaning is a new bond (the atom a 1,2-shift lands on) is shown as that new bond,
  // dashed line and all; its far-atom anchor is the same point.
  const newBondKeys = new Set(newBonds.map((place) => locusKey(place.destination)));
  const keptPlaces = drawnPlaces.filter((place) => !newBondKeys.has(locusKey(place.destination)));
  return [...keptPlaces, ...newBonds];
}

/** The place nearest `point` (by its anchors), or null if none is within NEAREST_PLACE_PIXELS. */
export function nearestDestinationTarget(
  targets: readonly DestinationTarget[],
  point: Point,
): DestinationTarget | null {
  let nearest: DestinationTarget | null = null;
  let nearestDistance = NEAREST_PLACE_PIXELS;
  for (const candidate of targets) {
    const distance = Math.min(...candidate.anchors.map((anchor) => distanceBetween(anchor, point)));
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}
