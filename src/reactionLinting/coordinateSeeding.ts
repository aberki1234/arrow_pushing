/**
 * Seed a state's 2D coordinates from RDKit, for states the author has not laid out.
 *
 * Purpose
 *   The renderer draws each state from mapNumberToCoordinates (docs/schema-design.md §3.2). A new
 *   state, or one whose atoms changed, gets a first layout from RDKit's depiction; the author
 *   tidies it later. Coordinates are in RDKit units (a bond about 1.5 long), y up, rounded to
 *   COORDINATE_DECIMAL_PLACES, so no conversion is needed.
 *
 * Steps
 *   1. seededCoordinates() lays out one mapped SMILES. RDKit can place separate molecules on top
 *      of each other, so each molecule that comes within MOLECULE_GAP of an earlier one is moved
 *      away from it, along the line between their centres, keeping the rough arrangement.
 *   2. seedMissingCoordinates() replaces the coordinates of every state whose coordinate keys are
 *      not exactly its map numbers (missing, incomplete or stale), and leaves the rest.
 */
import type { ChemistryToolkit, LaidOutAtom } from "../chemistryToolkit/chemistryToolkit.js";

const COORDINATE_DECIMAL_PLACES = 2; // 0.01 RDKit units: far below what a screen shows
const ROUNDING_FACTOR = 10 ** COORDINATE_DECIMAL_PLACES;
/** The least distance between atoms of different molecules: a bond and a half (RDKit units). */
const MOLECULE_GAP = 2.25;
const MOST_SEPARATION_PASSES = 50;

type Coordinates = Map<number, { x: number; y: number }>;

/** The map numbers of each molecule (dot-separated part) of a mapped SMILES. */
function moleculeMapNumbers(mappedSmiles: string): number[][] {
  return mappedSmiles
    .split(".")
    .map((part) => [...part.matchAll(/:(\d+)\]/g)].map((match) => Number(match[1])));
}

function closestDistance(points: Coordinates, first: number[], second: number[]): number {
  let closest = Number.POSITIVE_INFINITY;
  for (const firstMapNumber of first) {
    for (const secondMapNumber of second) {
      const pointA = points.get(firstMapNumber);
      const pointB = points.get(secondMapNumber);
      if (pointA !== undefined && pointB !== undefined) {
        closest = Math.min(closest, Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y));
      }
    }
  }
  return closest;
}

function centreOf(points: Coordinates, molecule: number[]): { x: number; y: number } {
  const present = molecule.flatMap((mapNumber) => points.get(mapNumber) ?? []);
  const count = Math.max(present.length, 1);
  return {
    x: present.reduce((sum, point) => sum + point.x, 0) / count,
    y: present.reduce((sum, point) => sum + point.y, 0) / count,
  };
}

/** Move `molecule` by `distance` directly away from `from`'s centre (to the right if level). */
function moveAway(points: Coordinates, molecule: number[], from: number[], distance: number): void {
  const start = centreOf(points, from);
  const end = centreOf(points, molecule);
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const [unitX, unitY] =
    length < 1e-6 ? [1, 0] : [(end.x - start.x) / length, (end.y - start.y) / length];
  for (const mapNumber of molecule) {
    const point = points.get(mapNumber);
    if (point !== undefined) {
      points.set(mapNumber, { x: point.x + unitX * distance, y: point.y + unitY * distance });
    }
  }
}

/** One pass moving each later molecule clear of each earlier one; whether anything moved. */
function separationPass(points: Coordinates, molecules: number[][]): boolean {
  let moved = false;
  for (const [index, molecule] of molecules.entries()) {
    for (const earlier of molecules.slice(0, index)) {
      const closest = closestDistance(points, earlier, molecule);
      if (closest < MOLECULE_GAP) {
        moveAway(points, molecule, earlier, MOLECULE_GAP - closest + 0.05);
        moved = true;
      }
    }
  }
  return moved;
}

function separatedMolecules(atoms: readonly LaidOutAtom[], mappedSmiles: string): LaidOutAtom[] {
  const points: Coordinates = new Map(
    atoms.map((atom) => [atom.mapNumber, { x: atom.x, y: atom.y }]),
  );
  const molecules = moleculeMapNumbers(mappedSmiles);
  for (let pass = 0; pass < MOST_SEPARATION_PASSES && separationPass(points, molecules); pass++) {
    // Each pass moves molecules apart until none is too close.
  }
  return atoms.map((atom) => ({ ...atom, ...(points.get(atom.mapNumber) ?? {}) }));
}

function rounded(value: number): number {
  // "+ 0" turns -0 into 0, so the file never holds "-0".
  return Math.round(value * ROUNDING_FACTOR) / ROUNDING_FACTOR + 0;
}

/**
 * {map number as text: [x, y]} for every atom of the mapped SMILES (explicit H included), in
 * map number order. Throws if RDKit cannot read it.
 */
export function seededCoordinates(
  mappedSmiles: string,
  toolkit: Pick<ChemistryToolkit, "laidOutAtoms">,
): Record<string, [number, number]> {
  const atoms = toolkit.laidOutAtoms(mappedSmiles);
  if (atoms === undefined) {
    throw new Error(`RDKit cannot read "${mappedSmiles}"`);
  }
  return coordinatesOf(separatedMolecules(atoms, mappedSmiles));
}

function coordinatesOf(atoms: readonly LaidOutAtom[]): Record<string, [number, number]> {
  const inMapNumberOrder = [...atoms].sort((first, second) => first.mapNumber - second.mapNumber);
  return Object.fromEntries(
    inMapNumberOrder.map((atom) => [String(atom.mapNumber), [rounded(atom.x), rounded(atom.y)]]),
  );
}

function sameKeys(first: Readonly<Record<string, unknown>>, second: object): boolean {
  const firstKeys = Object.keys(first);
  const secondKeys = new Set(Object.keys(second));
  return firstKeys.length === secondKeys.size && firstKeys.every((key) => secondKeys.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Seed, in place, each state whose coordinates do not cover exactly its mapped atoms. States whose
 * SMILES cannot be read are skipped (the linter reports them). Returns the ids of the states
 * seeded, in stateIdToState order.
 */
export function seedMissingCoordinates(
  reactionDocument: Record<string, unknown>,
  toolkit: Pick<ChemistryToolkit, "laidOutAtoms">,
): string[] {
  const states = isRecord(reactionDocument.stateIdToState) ? reactionDocument.stateIdToState : {};
  const seededStateIds: string[] = [];
  for (const [stateId, state] of Object.entries(states)) {
    if (!isRecord(state) || typeof state.mappedSmiles !== "string") {
      continue;
    }
    const atoms = toolkit.laidOutAtoms(state.mappedSmiles);
    if (atoms === undefined) {
      continue;
    }
    const coordinates = coordinatesOf(separatedMolecules(atoms, state.mappedSmiles));
    const present = isRecord(state.mapNumberToCoordinates) ? state.mapNumberToCoordinates : {};
    if (!sameKeys(present, coordinates)) {
      state.mapNumberToCoordinates = coordinates;
      seededStateIds.push(stateId);
    }
  }
  return seededStateIds;
}
