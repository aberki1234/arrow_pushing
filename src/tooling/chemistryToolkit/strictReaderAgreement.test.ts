/**
 * Our strict mapped-SMILES reader (stateGraphs/mappedSmilesReading.ts, used by the learner site)
 * checked against RDKit, on every valid shared case in
 * fixtures/state_graphs/mapped_smiles_cases.json and every state of the example reactions: both
 * must give the same elements, hydrogen counts, formal charges and bond orders for every atom.
 * RDKit reads the SMILES as written, without sanitising, so a Kekulé ring is compared bond for
 * bond.
 */
import { beforeAll, expect, it } from "vitest";
import { stateGraphFromMappedSmiles } from "../../core/stateGraphs/mappedSmilesReading.js";
import { mappedSmilesFromStateGraph } from "../../core/stateGraphs/mappedSmilesWriting.js";
import { bondKey, formalCharge } from "../../core/stateGraphs/stateGraph.js";
import {
  exampleReactionDocuments,
  fixtureCaseEntries,
  isRecord,
  textField,
} from "../../testSupport/fixtureFiles.js";
import { type ChemistryToolkit, loadChemistryToolkit } from "./chemistryToolkit.js";

let toolkit: ChemistryToolkit;

beforeAll(async () => {
  toolkit = await loadChemistryToolkit();
});

const fixtureSmiles = fixtureCaseEntries("state_graphs/mapped_smiles_cases.json", "validCases").map(
  (entry) => textField(entry, "mappedSmiles"),
);
const exampleStateSmiles = exampleReactionDocuments().flatMap(([, document]) => {
  const states = isRecord(document.stateIdToState) ? Object.values(document.stateIdToState) : [];
  return states.filter(isRecord).map((state) => textField(state, "mappedSmiles"));
});

/** Each atom as "element/H count/charge", and each bond's order, keyed by map numbers. */
function ourReading(mappedSmiles: string): { atoms: object; bonds: object } {
  const graph = stateGraphFromMappedSmiles(mappedSmiles);
  return {
    atoms: Object.fromEntries(
      [...graph.mapNumberToAtom].map(([mapNumber, atom]) => [
        mapNumber,
        `${atom.element}/${String(atom.hydrogenCount)}/${String(formalCharge(graph, mapNumber))}`,
      ]),
    ),
    bonds: Object.fromEntries(graph.bondToOrder),
  };
}

function rdkitReading(mappedSmiles: string): { atoms: object; bonds: object } {
  const structure = toolkit.readWrittenStructure(mappedSmiles);
  if (structure === undefined) {
    throw new Error(`RDKit cannot read ${mappedSmiles}`);
  }
  const mapNumberAt = (index: number): number => structure.atoms[index]?.mapNumber ?? 0;
  return {
    atoms: Object.fromEntries(
      structure.atoms.map((atom) => [
        atom.mapNumber,
        `${atom.element}/${String(atom.hydrogenCount)}/${String(atom.formalCharge)}`,
      ]),
    ),
    bonds: Object.fromEntries(
      structure.bonds.map((bond) => [
        bondKey(mapNumberAt(bond.firstAtomIndex), mapNumberAt(bond.secondAtomIndex)),
        bond.bondOrder,
      ]),
    ),
  };
}

const stereoFixtureSmiles = fixtureSmiles.filter((mappedSmiles) => /[@/\\]/u.test(mappedSmiles));

it.each(stereoFixtureSmiles)(
  "RDKit finds the same stereoisomer in %s after our reader and writer (item 12a)",
  (mappedSmiles) => {
    const rewritten = mappedSmilesFromStateGraph(stateGraphFromMappedSmiles(mappedSmiles));
    expect(toolkit.canonicalStereoSmiles(rewritten)).toBe(
      toolkit.canonicalStereoSmiles(mappedSmiles),
    );
  },
);

it.each([...new Set([...fixtureSmiles, ...exampleStateSmiles])].sort())(
  "RDKit reads %s as our strict reader does",
  (mappedSmiles) => {
    expect(ourReading(mappedSmiles)).toEqual(rdkitReading(mappedSmiles));
  },
);
