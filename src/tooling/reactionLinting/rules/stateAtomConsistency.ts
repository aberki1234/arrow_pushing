/**
 * Check that the atoms of every state in a reaction file are consistent with each other.
 *
 * A map number names one atom for the whole reaction, so it must carry the same element in every
 * state, and each state's coordinates must cover exactly its mapped atoms. The SMILES is read with
 * RDKit (chemistryToolkit), which reads more than the strict subset the learner site reads, so
 * these checks run, and say which atom is wrong, before the strict reading is tried.
 *
 * Terms
 *   map number  The atom-map number of an atom in a mapped SMILES ("[CH3:2]" has map number 2).
 *   state       One entry of stateIdToState: a mapped SMILES plus its drawing data.
 *
 * Rules checked, per state, in stateIdToState order
 *   1. The mapped SMILES can be read (explicit hydrogens kept as atoms).
 *   2. Every atom in it has a map number.
 *   3. No map number occurs twice in one state.
 *   4. A map number has the same element in every state where it occurs.
 *   5. mapNumberToCoordinates has a key for every map number in the state, and no other keys.
 *
 * The document is assumed schema-valid.
 */
import type { ChemistryToolkit, ToolkitAtom } from "../../chemistryToolkit/chemistryToolkit.js";
import { isRecord } from "../../../core/jsonValues/jsonValues.js";

type DocumentRecord = Readonly<Record<string, unknown>>;

/** Each map number's element. Rules 2 and 3 are reported into `problems`. */
function mapNumberToElementOf(
  stateId: string,
  atoms: readonly ToolkitAtom[],
  problems: string[],
): Map<number, string> {
  const mapNumberToElement = new Map<number, string>();
  for (const { element, mapNumber } of atoms) {
    if (mapNumber === 0) {
      problems.push(`state ${stateId}: an atom ${element} has no map number`);
    } else if (mapNumberToElement.has(mapNumber)) {
      problems.push(`state ${stateId}: map number ${String(mapNumber)} is used more than once`);
    } else {
      mapNumberToElement.set(mapNumber, element);
    }
  }
  return mapNumberToElement;
}

/** Rule 5: coordinates exactly for the state's map numbers. */
function coordinateProblems(
  stateId: string,
  mapNumbers: readonly number[],
  coordinateKeys: readonly string[],
): string[] {
  const withCoordinates = new Set(coordinateKeys.map(Number));
  const inState = new Set(mapNumbers);
  const byNumber = (first: number, second: number): number => first - second;
  const missing = mapNumbers.filter((mapNumber) => !withCoordinates.has(mapNumber));
  const absent = [...withCoordinates].filter((mapNumber) => !inState.has(mapNumber));
  return [
    ...missing
      .sort(byNumber)
      .map((mapNumber) => `state ${stateId}: no coordinates for map number ${String(mapNumber)}`),
    ...absent
      .sort(byNumber)
      .map(
        (mapNumber) =>
          `state ${stateId}: coordinates for map number ${String(mapNumber)}, ` +
          "which is not in the state",
      ),
  ];
}

/**
 * One text line per broken rule, each starting with "state <state id>: "; empty if all hold.
 */
export function stateAtomProblems(
  reactionDocument: DocumentRecord,
  toolkit: Pick<ChemistryToolkit, "readAtoms">,
): string[] {
  const problems: string[] = [];
  // The first state where each map number was seen, and its element there (for rule 4).
  const mapNumberToFirstSeen = new Map<number, { stateId: string; element: string }>();
  const states = isRecord(reactionDocument.stateIdToState) ? reactionDocument.stateIdToState : {};
  for (const [stateId, state] of Object.entries(states)) {
    const record = isRecord(state) ? state : {};
    const mappedSmiles = typeof record.mappedSmiles === "string" ? record.mappedSmiles : "";
    const atoms = toolkit.readAtoms(mappedSmiles);
    if (atoms === undefined) {
      problems.push(`state ${stateId}: mapped SMILES cannot be read: ${mappedSmiles}`);
      continue;
    }
    const mapNumberToElement = mapNumberToElementOf(stateId, atoms, problems);
    for (const [mapNumber, element] of mapNumberToElement) {
      const firstSeen = mapNumberToFirstSeen.get(mapNumber) ?? { stateId, element };
      mapNumberToFirstSeen.set(mapNumber, firstSeen);
      if (element !== firstSeen.element) {
        problems.push(
          `state ${stateId}: map number ${String(mapNumber)} is ${element} here ` +
            `but ${firstSeen.element} in state ${firstSeen.stateId}`,
        );
      }
    }
    const coordinates = isRecord(record.mapNumberToCoordinates)
      ? record.mapNumberToCoordinates
      : {};
    problems.push(
      ...coordinateProblems(stateId, [...mapNumberToElement.keys()], Object.keys(coordinates)),
    );
  }
  return problems;
}
