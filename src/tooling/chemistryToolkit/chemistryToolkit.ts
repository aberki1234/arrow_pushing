/**
 * RDKit.js (RDKit compiled to WebAssembly) behind the few calls this project needs: reading the
 * atoms of any SMILES RDKit reads, laying them out in 2D, and reading a structure exactly as
 * written (to check our own strict reader against RDKit).
 *
 * Loaded only by the Node tools (linter, catalogue build) and, later, the editor; never by the
 * learner site, which reads states with its own strict parser (stateGraphs/mappedSmilesReading).
 *
 * Terms
 *   map number  The atom-map number of an atom ("[CH3:2]" has 2); 0 for an atom without one.
 *   molblock    RDKit's V2000 MDL text for a molecule. Each atom line holds x, y, z, the element
 *               symbol, then twelve number fields; the tenth of those is the map number.
 *
 * Coordinates are RDKit's own (a bond about 1.5 long, y up), as docs/schema-design.md §3.2 keeps
 * them.
 */
import initRDKitModule, { type MainModule as RDKitModule, type Mol } from "@rdkit/rdkit";
import { isRecord } from "../../core/jsonValues/jsonValues.js";

/** `mapNumber` is 0 for an atom written without one. */
export interface ToolkitAtom {
  readonly element: string;
  readonly mapNumber: number;
}

export interface LaidOutAtom extends ToolkitAtom {
  readonly x: number;
  readonly y: number;
}

export interface WrittenAtom extends ToolkitAtom {
  readonly hydrogenCount: number;
  readonly formalCharge: number;
}

/** A bond between two atoms, named by their positions in `atoms`. */
export interface WrittenBond {
  readonly firstAtomIndex: number;
  readonly secondAtomIndex: number;
  readonly bondOrder: number;
}

export interface WrittenStructure {
  readonly atoms: readonly WrittenAtom[];
  readonly bonds: readonly WrittenBond[];
}

/** Every call gives undefined for SMILES RDKit cannot read. Atoms come in SMILES order. */
export interface ChemistryToolkit {
  /** Explicit hydrogens such as "[H:5]" are kept as atoms. */
  readAtoms(smiles: string): ToolkitAtom[] | undefined;
  /** As readAtoms, with a fresh RDKit 2D layout. */
  laidOutAtoms(smiles: string): LaidOutAtom[] | undefined;
  /**
   * Atoms (with hydrogen counts and charges) and bonds exactly as written: RDKit does not
   * sanitise, so a Kekulé ring keeps its bonds and no hydrogens are added.
   */
  readWrittenStructure(smiles: string): WrittenStructure | undefined;
  /**
   * Atoms and bonds after RDKit's usual reading, for SMILES as people write it: written hydrogens
   * become implicit counts and aromatic rings are given one Kekulé form.
   */
  readStructure(smiles: string): WrittenStructure | undefined;
  /**
   * A V2000 molblock (from Ketcher, item 10h) read the usual way, explicit hydrogens kept: hydrogen
   * counts and charges worked out, map numbers from the atom-map column, rings in Kekulé form.
   */
  readMolblock(molblock: string): WrittenStructure | undefined;
  /**
   * RDKit's canonical SMILES with stereo and map numbers (item 12a): two writings of one
   * stereoisomer give the same text. Explicit hydrogens are kept.
   */
  canonicalStereoSmiles(smiles: string): string | undefined;
}

// Explicit hydrogens are drawn atoms, so RDKit must not fold them into their neighbours.
const KEEP_EXPLICIT_HYDROGENS = JSON.stringify({ removeHs: false });
const AS_WRITTEN = JSON.stringify({ removeHs: false, sanitize: false });
const RDKIT_DEFAULTS = JSON.stringify({});
const MOLBLOCK_HEADER_LINES = 3;
// Fields of an atom line split at white space: x, y, z, symbol, then the number fields.
const SYMBOL_FIELD = 3;
const MAP_NUMBER_FIELD = 13;

function numberField(fields: readonly string[], position: number, line: string): number {
  const value = Number(fields[position]);
  if (fields[position] === undefined || Number.isNaN(value)) {
    throw new Error(`unexpected molblock atom line: "${line}"`);
  }
  return value;
}

/** The atoms of a V2000 molblock, with their coordinates. */
function molblockAtoms(molblock: string): LaidOutAtom[] {
  const lines = molblock.split("\n");
  const countsLine = lines[MOLBLOCK_HEADER_LINES] ?? "";
  if (!countsLine.includes("V2000")) {
    throw new Error("only V2000 molblocks are read");
  }
  const atomCount = Number(countsLine.slice(0, 3));
  const atomLines = lines.slice(MOLBLOCK_HEADER_LINES + 1, MOLBLOCK_HEADER_LINES + 1 + atomCount);
  return atomLines.map((line) => {
    const fields = line.trim().split(/\s+/);
    return {
      element: fields[SYMBOL_FIELD] ?? "",
      mapNumber: numberField(fields, MAP_NUMBER_FIELD, line),
      x: numberField(fields, 0, line),
      y: numberField(fields, 1, line),
    };
  });
}

/** A number field of an RDKit JSON atom or bond, falling back to the file's default. */
function jsonNumber(item: unknown, defaults: unknown, key: string): number {
  const value =
    (isRecord(item) ? item[key] : undefined) ?? (isRecord(defaults) ? defaults[key] : undefined);
  if (typeof value !== "number") {
    throw new Error(`RDKit JSON: no number "${key}"`);
  }
  return value;
}

/** The structure in RDKit's JSON ("rdkitjson"), with symbols and map numbers from the molblock. */
function writtenStructure(molecule: Mol): WrittenStructure {
  const document: unknown = JSON.parse(molecule.get_json());
  const defaults = isRecord(document) ? document.defaults : undefined;
  const molecules: unknown[] =
    isRecord(document) && Array.isArray(document.molecules) ? document.molecules : [];
  const [moleculeJson] = molecules;
  const atomDefaults = isRecord(defaults) ? defaults.atom : undefined;
  const bondDefaults = isRecord(defaults) ? defaults.bond : undefined;
  const atomsJson: unknown[] =
    isRecord(moleculeJson) && Array.isArray(moleculeJson.atoms) ? moleculeJson.atoms : [];
  const bondsJson: unknown[] =
    isRecord(moleculeJson) && Array.isArray(moleculeJson.bonds) ? moleculeJson.bonds : [];
  const symbolAtoms = molblockAtoms(molecule.get_molblock());
  return {
    atoms: atomsJson.map((atom, index) => ({
      element: symbolAtoms[index]?.element ?? "",
      mapNumber: symbolAtoms[index]?.mapNumber ?? 0,
      hydrogenCount: jsonNumber(atom, atomDefaults, "impHs"),
      formalCharge: jsonNumber(atom, atomDefaults, "chg"),
    })),
    bonds: bondsJson.map((bond) => {
      const atomIndexes: unknown[] = isRecord(bond) && Array.isArray(bond.atoms) ? bond.atoms : [];
      const [firstAtomIndex, secondAtomIndex] = atomIndexes;
      if (typeof firstAtomIndex !== "number" || typeof secondAtomIndex !== "number") {
        throw new Error("RDKit JSON: a bond without two atoms");
      }
      return { firstAtomIndex, secondAtomIndex, bondOrder: jsonNumber(bond, bondDefaults, "bo") };
    }),
  };
}

/** Run `use` on the molecule read from `smiles`, freeing it afterwards. */
function withMolecule<Result>(
  rdkit: RDKitModule,
  smiles: string,
  use: (molecule: Mol) => Result,
  readingOptions: string = KEEP_EXPLICIT_HYDROGENS,
): Result | undefined {
  const molecule = rdkit.get_mol(smiles, readingOptions);
  if (molecule === null) {
    return undefined;
  }
  try {
    return molecule.is_valid() ? use(molecule) : undefined;
  } finally {
    molecule.delete();
  }
}

function toolkitOn(rdkit: RDKitModule): ChemistryToolkit {
  return {
    readAtoms: (smiles) =>
      withMolecule(rdkit, smiles, (molecule) =>
        molblockAtoms(molecule.get_molblock()).map(({ element, mapNumber }) => ({
          element,
          mapNumber,
        })),
      ),
    laidOutAtoms: (smiles) =>
      withMolecule(rdkit, smiles, (molecule) => {
        molecule.set_new_coords();
        return molblockAtoms(molecule.get_molblock());
      }),
    readStructure: (smiles) => withMolecule(rdkit, smiles, writtenStructure, RDKIT_DEFAULTS),
    readWrittenStructure: (smiles) => withMolecule(rdkit, smiles, writtenStructure, AS_WRITTEN),
    readMolblock: (molblock) =>
      withMolecule(rdkit, molblock, writtenStructure, KEEP_EXPLICIT_HYDROGENS),
    canonicalStereoSmiles: (smiles) =>
      withMolecule(rdkit, smiles, (molecule) => molecule.get_smiles()),
  };
}

let loadedToolkit: Promise<ChemistryToolkit> | undefined;

/**
 * RDKit.js, loaded once (it is several megabytes of WebAssembly). In a browser, `wasmLocation` is
 * the URL the page serves RDKit_minimal.wasm at; in Node it is found next to the script. Options
 * after the first call are ignored.
 */
export function loadChemistryToolkit(
  options: { readonly wasmLocation?: string } = {},
): Promise<ChemistryToolkit> {
  const { wasmLocation } = options;
  loadedToolkit ??= initRDKitModule(
    wasmLocation === undefined ? undefined : { locateFile: (): string => wasmLocation },
  ).then(toolkitOn);
  return loadedToolkit;
}
