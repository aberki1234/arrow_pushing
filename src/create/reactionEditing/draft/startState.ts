/**
 * A structure pasted as ordinary SMILES, made into a state the editor can store
 * (docs/SPEC.md §5, editor decisions 2026-11-25).
 *
 * Steps
 *   1. RDKit reads the SMILES as people write it (chemistryToolkit.readStructure): written
 *      hydrogens become implicit counts, an aromatic ring gets one Kekulé form.
 *   2. Heavy atoms are numbered from `firstMapNumber` in the order written; map numbers in the
 *      paste are ignored.
 *   3. Each atom's nonbonding electrons are worked out as valence electrons - formal charge - bond
 *      orders - hydrogens (stateGraphs/stateGraph.ts), and the state is written as strict mapped
 *      SMILES (stateGraphs/mappedSmilesWriting.ts).
 *   4. RDKit lays it out (coordinates rounded as the coordinate seeding rounds them).
 *
 * Error codes (StructureEntryError.errorCode)
 *   smiles-not-readable        RDKit cannot read it, or it has no atoms
 *   unsupported-element        an element the state graph has no valence entry for
 *   impossible-electron-count  more bonds, hydrogens and charge than the valence electrons allow
 */
import type {
  ChemistryToolkit,
  WrittenStructure,
} from "../../../tooling/chemistryToolkit/chemistryToolkit.js";
import { seededCoordinates } from "../../../tooling/chemistryToolkit/coordinateSeeding.js";
import { mappedSmilesFromStateGraph } from "../../../core/stateGraphs/mappedSmilesWriting.js";
import {
  bondKey,
  ELEMENT_TO_VALENCE_ELECTRONS,
  type StateAtom,
  type StateGraph,
} from "../../../core/stateGraphs/stateGraph.js";

/** A state as stored in a reaction file, before any learner text is added. */
export interface DraftState {
  readonly mappedSmiles: string;
  readonly mapNumberToCoordinates: Record<string, [number, number]>;
}

export type StructureEntryErrorCode =
  "smiles-not-readable" | "unsupported-element" | "impossible-electron-count";

/** A pasted structure that cannot become a state; `errorCode` says why. */
export class StructureEntryError extends Error {
  readonly errorCode: StructureEntryErrorCode;

  constructor(errorCode: StructureEntryErrorCode, message: string) {
    super(message);
    this.name = "StructureEntryError";
    this.errorCode = errorCode;
  }
}

/** The structure as a state graph, atoms numbered from `firstMapNumber`. */
function stateGraphOf(structure: WrittenStructure, firstMapNumber: number): StateGraph {
  const mapNumberAt = (index: number): number => firstMapNumber + index;
  const bondToOrder = new Map(
    structure.bonds.map((bond) => [
      bondKey(mapNumberAt(bond.firstAtomIndex), mapNumberAt(bond.secondAtomIndex)),
      bond.bondOrder,
    ]),
  );
  const bondOrderSums = structure.atoms.map(() => 0);
  for (const bond of structure.bonds) {
    bondOrderSums[bond.firstAtomIndex] = (bondOrderSums[bond.firstAtomIndex] ?? 0) + bond.bondOrder;
    bondOrderSums[bond.secondAtomIndex] =
      (bondOrderSums[bond.secondAtomIndex] ?? 0) + bond.bondOrder;
  }
  const atoms = structure.atoms.map((atom, index): StateAtom => {
    const valenceElectrons = ELEMENT_TO_VALENCE_ELECTRONS.get(atom.element);
    if (valenceElectrons === undefined) {
      throw new StructureEntryError(
        "unsupported-element",
        `${atom.element} is not an element reaction files can use yet`,
      );
    }
    const nonbondingElectronCount =
      valenceElectrons - atom.formalCharge - (bondOrderSums[index] ?? 0) - atom.hydrogenCount;
    if (nonbondingElectronCount < 0) {
      throw new StructureEntryError(
        "impossible-electron-count",
        `${atom.element} has more bonds, hydrogens and charge than its valence electrons allow`,
      );
    }
    return {
      mapNumber: mapNumberAt(index),
      element: atom.element,
      hydrogenCount: atom.hydrogenCount,
      nonbondingElectronCount,
    };
  });
  return { mapNumberToAtom: new Map(atoms.map((atom) => [atom.mapNumber, atom])), bondToOrder };
}

/** The pasted SMILES as a state; throws StructureEntryError (see the module comment). */
export function stateFromPastedSmiles(
  pastedSmiles: string,
  toolkit: Pick<ChemistryToolkit, "readStructure" | "laidOutAtoms">,
  firstMapNumber = 1,
): DraftState {
  const structure = pastedSmiles.trim() === "" ? undefined : toolkit.readStructure(pastedSmiles);
  if (structure === undefined || structure.atoms.length === 0) {
    throw new StructureEntryError("smiles-not-readable", `RDKit cannot read "${pastedSmiles}"`);
  }
  const mappedSmiles = mappedSmilesFromStateGraph(stateGraphOf(structure, firstMapNumber));
  return { mappedSmiles, mapNumberToCoordinates: seededCoordinates(mappedSmiles, toolkit) };
}
