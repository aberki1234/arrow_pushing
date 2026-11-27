/**
 * A state to Ketcher and back (item 10h, docs/schema-design.md §10): Create's structure editor
 * edits a V2000 molfile; this writes one from a state and reads Ketcher's back into a state.
 *
 * Molfile, both ways
 *   atom line   x, y (our coordinates, a bond 1.5 long), symbol, the map number in columns 61–63
 *   bond line   order (1–3, Kekulé), stereo 1 = wedge, 6 = dash, narrow end at the first atom
 *   M  CHG / M  RAD   formal charges and unpaired electrons
 * Reading Ketcher's: RDKit.js works out hydrogen counts and charges (readMolblock); our writer
 * gives the mapped Kekulé SMILES; coordinates are rescaled so the median bond is 1.5 long; an atom
 * without a map number gets the next free one.
 * Saving (applyEditedStructure): the start state takes any structure; every later state only a
 * new layout and wedges, because its bonds come from the arrows.
 */
import type { ChemistryToolkit } from "../../../tooling/chemistryToolkit/chemistryToolkit.js";
import { stateGraphFromMappedSmiles } from "../../../core/stateGraphs/mappedSmilesReading.js";
import { mappedSmilesFromStateGraph } from "../../../core/stateGraphs/mappedSmilesWriting.js";
import {
  ELEMENT_TO_VALENCE_ELECTRONS,
  type StateAtom,
  type StateGraph,
  bondKey,
  bondKeyMapNumbers,
  formalCharge,
  stateGraphsEqual,
} from "../../../core/stateGraphs/stateGraph.js";
import type { FieldEdit } from "../draft/fieldEdits.js";
import { type ReactionDocument, statesOf } from "../draft/reactionDraft.js";

/** What the structure editor changes in a state. */
export interface EditedStructure {
  readonly mappedSmiles: string;
  readonly mapNumberToCoordinates: Record<string, [number, number]>;
  readonly bondToWedgeStyle: Record<string, "wedge" | "dash">;
}

interface StateStructure {
  readonly mappedSmiles: string;
  readonly mapNumberToCoordinates?: Readonly<Record<string, readonly number[]>>;
  readonly bondToWedgeStyle?: Readonly<Record<string, string>>;
}

const BOND_LENGTH = 1.5;
const STEREO_TO_STYLE: Readonly<Record<number, "wedge" | "dash">> = { 1: "wedge", 6: "dash" };
const STYLE_TO_STEREO: Readonly<Record<string, number>> = { wedge: 1, dash: 6 };
/** The counts line after the atom and bond counts. */
const COUNTS_LINE_END = "  0  0  0  0  0  0  0  0999 V2000";
/** The atom-line fields between the symbol and the map number, all zero. */
const ATOM_LINE_ZEROS = " 0  0  0  0  0  0  0  0  0";

const field = (value: number | string, width: number): string => String(value).padStart(width);

function atomLine(atom: StateAtom, point: readonly number[] | undefined): string {
  const [across = 0, up = 0] = point ?? [];
  const coordinates = [across, up, 0].map((value) => value.toFixed(4).padStart(10)).join("");
  const symbol = atom.element.padEnd(3);
  return `${coordinates} ${symbol}${ATOM_LINE_ZEROS}${field(atom.mapNumber, 3)}  0  0`;
}

/** V2000 property lines ("M  CHG", "M  RAD"), at most eight entries a line. */
function propertyLines(tag: string, entries: readonly [number, number][]): string[] {
  const lines: string[] = [];
  for (let start = 0; start < entries.length; start += 8) {
    const chunk = entries.slice(start, start + 8);
    const pairs = chunk.map(([atomPosition, value]) => field(atomPosition, 4) + field(value, 4));
    lines.push(`M  ${tag}${field(chunk.length, 3)}${pairs.join("")}`);
  }
  return lines;
}

function bondLine(
  [first, second]: [number, number],
  order: number,
  wedges: Readonly<Record<string, string>>,
  position: ReadonlyMap<number, number>,
): string {
  let ends = [first, second];
  let stereo = 0;
  for (const [narrow, wide] of [
    [first, second],
    [second, first],
  ] as const) {
    const style = wedges[`${String(narrow)}-${String(wide)}`];
    if (style !== undefined && order === 1) {
      ends = [narrow, wide];
      stereo = STYLE_TO_STEREO[style] ?? 0;
    }
  }
  const atomFields = ends.map((mapNumber) => field(position.get(mapNumber) ?? 0, 3)).join("");
  return `${atomFields}${field(order, 3)}${field(stereo, 3)}`;
}

export function stateToMolfile(state: StateStructure): string {
  const graph = stateGraphFromMappedSmiles(state.mappedSmiles);
  const atoms = [...graph.mapNumberToAtom.values()].sort(
    (first, second) => first.mapNumber - second.mapNumber,
  );
  const position = new Map(atoms.map((atom, index) => [atom.mapNumber, index + 1]));
  const bondLines = [...graph.bondToOrder].map(([key, order]) =>
    bondLine(bondKeyMapNumbers(key), order, state.bondToWedgeStyle ?? {}, position),
  );
  const atomPosition = (atom: StateAtom): number => position.get(atom.mapNumber) ?? 0;
  const charges = atoms
    .map((atom): [number, number] => [atomPosition(atom), formalCharge(graph, atom.mapNumber)])
    .filter(([, charge]) => charge !== 0);
  const radicals = atoms
    .filter((atom) => atom.nonbondingElectronCount % 2 === 1)
    .map((atom): [number, number] => [atomPosition(atom), 2]);
  const counts = `${field(atoms.length, 3)}${field(bondLines.length, 3)}${COUNTS_LINE_END}`;
  const atomLines = atoms.map((atom) =>
    atomLine(atom, state.mapNumberToCoordinates?.[String(atom.mapNumber)]),
  );
  return [
    "",
    "  ArrowPush",
    "",
    counts,
    ...atomLines,
    ...bondLines,
    ...propertyLines("CHG", charges),
    ...propertyLines("RAD", radicals),
    "M  END",
  ].join("\n");
}

interface MolfileAtom {
  readonly across: number;
  readonly up: number;
  readonly mapNumber: number;
}
interface MolfileBond {
  readonly first: number;
  readonly second: number;
  readonly stereo: number;
}

function parseMolfile(molfile: string): { atoms: MolfileAtom[]; bonds: MolfileBond[] } {
  const lines = molfile.split("\n");
  const countsAt = lines.findIndex((line) => line.includes("V2000"));
  if (countsAt < 0) {
    throw new Error("the structure editor did not give a V2000 molfile");
  }
  const counts = lines[countsAt] ?? "";
  const atomCount = Number(counts.slice(0, 3));
  const bondCount = Number(counts.slice(3, 6));
  const atoms = lines.slice(countsAt + 1, countsAt + 1 + atomCount).map((line) => ({
    across: Number(line.slice(0, 10)),
    up: Number(line.slice(10, 20)),
    mapNumber: Number(line.slice(60, 63)) || 0,
  }));
  const bondsStart = countsAt + 1 + atomCount;
  const bonds = lines.slice(bondsStart, bondsStart + bondCount).map((line) => ({
    first: Number(line.slice(0, 3)),
    second: Number(line.slice(3, 6)),
    stereo: Number(line.slice(9, 12)) || 0,
  }));
  return { atoms, bonds };
}

/** Map numbers for every atom: its own, or the next free one (above `used` and the file's). */
function assignedMapNumbers(atoms: readonly MolfileAtom[], used: readonly number[]): number[] {
  let next = Math.max(0, ...used, ...atoms.map((atom) => atom.mapNumber)) + 1;
  return atoms.map((atom) => (atom.mapNumber > 0 ? atom.mapNumber : next++));
}

/** The molfile with these map numbers written into its atom lines. */
function withMapNumbers(molfile: string, mapNumbers: readonly number[]): string {
  const lines = molfile.split("\n");
  const countsAt = lines.findIndex((line) => line.includes("V2000"));
  mapNumbers.forEach((mapNumber, index) => {
    const line = (lines[countsAt + 1 + index] ?? "").padEnd(69);
    lines[countsAt + 1 + index] = `${line.slice(0, 60)}${field(mapNumber, 3)}${line.slice(63)}`;
  });
  return lines.join("\n");
}

function scaledCoordinates(
  atoms: readonly MolfileAtom[],
  bonds: readonly MolfileBond[],
  mapNumbers: readonly number[],
): Record<string, [number, number]> {
  const lengths = bonds
    .map(({ first, second }) => {
      const firstAtom = atoms[first - 1];
      const secondAtom = atoms[second - 1];
      return firstAtom === undefined || secondAtom === undefined
        ? 0
        : Math.hypot(firstAtom.across - secondAtom.across, firstAtom.up - secondAtom.up);
    })
    .filter((length) => length > 0)
    .sort((shorter, longer) => shorter - longer);
  const median = lengths[Math.floor(lengths.length / 2)] ?? BOND_LENGTH;
  const scale = BOND_LENGTH / median;
  const round = (value: number): number => Math.round(value * 100) / 100 + 0;
  return Object.fromEntries(
    atoms.map((atom, index) => [
      String(mapNumbers[index]),
      [round(atom.across * scale), round(atom.up * scale)],
    ]),
  );
}

/** The state graph of what RDKit read, with our map numbers and electron counts. */
function graphOfWritten(
  written: NonNullable<ReturnType<ChemistryToolkit["readMolblock"]>>,
  mapNumbers: readonly number[],
): StateGraph {
  const bondToOrder = new Map<string, number>();
  written.bonds.forEach(({ firstAtomIndex, secondAtomIndex, bondOrder }) => {
    bondToOrder.set(
      bondKey(mapNumbers[firstAtomIndex] ?? 0, mapNumbers[secondAtomIndex] ?? 0),
      bondOrder,
    );
  });
  const mapNumberToAtom = new Map<number, StateAtom>();
  written.atoms.forEach((atom, index) => {
    const mapNumber = mapNumbers[index] ?? 0;
    const bondSum = [...bondToOrder]
      .filter(([key]) => bondKeyMapNumbers(key).includes(mapNumber))
      .reduce((sum, [, order]) => sum + order, 0);
    const valence = ELEMENT_TO_VALENCE_ELECTRONS.get(atom.element) ?? 0;
    mapNumberToAtom.set(mapNumber, {
      mapNumber,
      element: atom.element,
      hydrogenCount: atom.hydrogenCount,
      nonbondingElectronCount: valence - atom.formalCharge - bondSum - atom.hydrogenCount,
    });
  });
  return { mapNumberToAtom, bondToOrder };
}

/** Ketcher's molfile as a state's structure; `used` are map numbers already in the reaction. */
export function molfileToStructure(
  molfile: string,
  toolkit: Pick<ChemistryToolkit, "readMolblock">,
  used: readonly number[],
): EditedStructure {
  const { atoms, bonds } = parseMolfile(molfile);
  const mapNumbers = assignedMapNumbers(atoms, used);
  const written = toolkit.readMolblock(withMapNumbers(molfile, mapNumbers));
  if (written === undefined) {
    throw new Error("RDKit cannot read the structure");
  }
  const bondToWedgeStyle = Object.fromEntries(
    bonds.flatMap(({ first, second, stereo }) => {
      const style = STEREO_TO_STYLE[stereo];
      const key = `${String(mapNumbers[first - 1])}-${String(mapNumbers[second - 1])}`;
      return style === undefined ? [] : [[key, style]];
    }),
  );
  return {
    mappedSmiles: mappedSmilesFromStateGraph(graphOfWritten(written, mapNumbers)),
    mapNumberToCoordinates: scaledCoordinates(atoms, bonds, mapNumbers),
    bondToWedgeStyle,
  };
}

/** The mean of a layout's points, or undefined for an empty one. */
function centreOf(
  coordinates: Readonly<Record<string, readonly number[]>>,
): [number, number] | undefined {
  const points = Object.values(coordinates);
  if (points.length === 0) {
    return undefined;
  }
  const mean = (axis: number): number =>
    points.reduce((sum, point) => sum + (point[axis] ?? 0), 0) / points.length;
  return [mean(0), mean(1)];
}

/** The edited layout moved so its centre is where the state's old layout's centre was. */
function centredLike(
  coordinates: Record<string, [number, number]>,
  state: Readonly<Record<string, unknown>>,
): Record<string, [number, number]> {
  const old = state.mapNumberToCoordinates;
  const oldCentre =
    typeof old === "object" && old !== null
      ? centreOf(old as Record<string, readonly number[]>)
      : undefined;
  const newCentre = centreOf(coordinates);
  if (oldCentre === undefined || newCentre === undefined) {
    return coordinates;
  }
  const round = (value: number): number => Math.round(value * 100) / 100 + 0;
  return Object.fromEntries(
    Object.entries(coordinates).map(([key, [across, up]]) => [
      key,
      [round(across - newCentre[0] + oldCentre[0]), round(up - newCentre[1] + oldCentre[1])],
    ]),
  );
}

const BONDS_LOCKED =
  "In this state the bonds come from the arrows: move atoms and change wedges here, " +
  "or change the arrows (or the start state) instead.";

/**
 * Save an edited structure into a state. The start state takes it whole; a later state only its
 * coordinates and wedges, and is refused if its atoms or bonds changed.
 */
export function applyEditedStructure(
  document: ReactionDocument,
  stateId: string,
  structure: EditedStructure,
): FieldEdit {
  const state = statesOf(document)[stateId];
  if (typeof state !== "object" || state === null) {
    return { outcome: "refused", reason: `no state "${stateId}"` };
  }
  const current = state as Record<string, unknown>;
  const isStart = document.startStateId === stateId;
  if (!isStart) {
    const same = stateGraphsEqual(
      stateGraphFromMappedSmiles(String(current.mappedSmiles)),
      stateGraphFromMappedSmiles(structure.mappedSmiles),
    );
    if (!same) {
      return { outcome: "refused", reason: BONDS_LOCKED };
    }
  }
  const updated: Record<string, unknown> = {
    ...current,
    ...(isStart ? { mappedSmiles: structure.mappedSmiles } : {}),
    mapNumberToCoordinates: centredLike(structure.mapNumberToCoordinates, current),
  };
  if (Object.keys(structure.bondToWedgeStyle).length > 0) {
    updated.bondToWedgeStyle = structure.bondToWedgeStyle;
  } else {
    delete updated.bondToWedgeStyle;
  }
  return {
    outcome: "edited",
    document: { ...document, stateIdToState: { ...statesOf(document), [stateId]: updated } },
  };
}

/** Every map number used anywhere in the reaction (new atoms are numbered after them). */
function usedMapNumbers(document: ReactionDocument): number[] {
  return Object.values(statesOf(document)).flatMap((state) => {
    const smiles =
      typeof state === "object" && state !== null
        ? (state as { mappedSmiles?: unknown }).mappedSmiles
        : undefined;
    const text = typeof smiles === "string" ? smiles : "";
    return [...text.matchAll(/:(\d+)\]/g)].map((match) => Number(match[1]));
  });
}

/** What Create does with the structure editor's molfile: read it and save it into the state. */
export function saveStructureFromEditor(
  document: ReactionDocument,
  stateId: string,
  molfile: string,
  toolkit: Pick<ChemistryToolkit, "readMolblock">,
): FieldEdit {
  try {
    const structure = molfileToStructure(molfile, toolkit, usedMapNumbers(document));
    return applyEditedStructure(document, stateId, structure);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { outcome: "refused", reason: `The structure could not be read: ${reason}` };
  }
}
