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
 *   1. seededCoordinates() lays out one mapped SMILES.
 *   2. seedMissingCoordinates() replaces the coordinates of every state whose coordinate keys are
 *      not exactly its map numbers (missing, incomplete or stale), and leaves the rest.
 */
import type { ChemistryToolkit, LaidOutAtom } from "../chemistryToolkit/chemistryToolkit.js";

const COORDINATE_DECIMAL_PLACES = 2; // 0.01 RDKit units: far below what a screen shows
const ROUNDING_FACTOR = 10 ** COORDINATE_DECIMAL_PLACES;

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
  return coordinatesOf(atoms);
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
    const coordinates = coordinatesOf(atoms);
    const present = isRecord(state.mapNumberToCoordinates) ? state.mapNumberToCoordinates : {};
    if (!sameKeys(present, coordinates)) {
      state.mapNumberToCoordinates = coordinates;
      seededStateIds.push(stateId);
    }
  }
  return seededStateIds;
}
