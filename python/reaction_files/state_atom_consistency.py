"""Check that the atoms of every state in a reaction file are consistent with each other.

A map number names one atom for the whole reaction, so it must carry the same element in every
state, and each state's coordinates must cover exactly its mapped atoms. These checks need RDKit
(to read the SMILES), so they are not part of the JSON schema.

Terms
    map number   The atom-map number of an atom in a mapped SMILES ("[CH3:2]" has map number 2).
    state        One entry of stateIdToState: a mapped SMILES plus its drawing data.

Rules checked, per state
    1. The mapped SMILES can be read (RDKit, explicit hydrogens kept).
    2. Every atom in it has a map number.
    3. No map number occurs twice in one state.
    4. A map number has the same element in every state where it occurs.
    5. mapNumberToCoordinates has a key for every map number in the state, and no other keys.
"""
from typing import Any, Dict, List, Mapping, Optional, Tuple

from rdkit import Chem, RDLogger

# RDKit prints its own parse errors to stderr; the problem list already says which state failed.
RDLogger.DisableLog("rdApp.*")  # type: ignore[attr-defined]


def _read_mapped_smiles(mapped_smiles: str) -> Optional[Chem.Mol]:
    """The molecule, keeping explicit hydrogens such as "[H:4]" as atoms; None if unreadable."""
    parser_parameters = Chem.SmilesParserParams()
    parser_parameters.removeHs = False
    return Chem.MolFromSmiles(mapped_smiles, parser_parameters)


def _map_number_to_element(state_id: str, molecule: Chem.Mol,
                           problems: List[str]) -> Dict[int, str]:
    """Each map number's element symbol. Rules 2 and 3 are reported into `problems`."""
    map_number_to_element: Dict[int, str] = {}
    for atom in molecule.GetAtoms():
        map_number = atom.GetAtomMapNum()
        if map_number == 0:  # RDKit gives 0 to an atom without a map number
            problems.append(f"state {state_id}: an atom {atom.GetSymbol()} has no map number")
        elif map_number in map_number_to_element:
            problems.append(f"state {state_id}: map number {map_number} is used more than once")
        else:
            map_number_to_element[map_number] = atom.GetSymbol()
    return map_number_to_element


def _coordinate_problems(state_id: str, map_numbers: List[int],
                         coordinate_keys: List[str]) -> List[str]:
    """Rule 5: coordinates exactly for the state's map numbers."""
    with_coordinates = {int(key) for key in coordinate_keys}
    problems = [f"state {state_id}: no coordinates for map number {map_number}"
                for map_number in sorted(set(map_numbers) - with_coordinates)]
    problems += [f"state {state_id}: coordinates for map number {map_number}, "
                 "which is not in the state"
                 for map_number in sorted(with_coordinates - set(map_numbers))]
    return problems


def state_atom_problems(reaction_document: Mapping[str, Any]) -> List[str]:
    """One text line per broken rule, each starting with "state <state id>: "; empty if all hold.
    States are checked in the order of stateIdToState."""
    problems: List[str] = []
    # The first state where each map number was seen, and its element there (for rule 4).
    map_number_to_first_state_and_element: Dict[int, Tuple[str, str]] = {}
    for state_id, state in reaction_document["stateIdToState"].items():
        molecule = _read_mapped_smiles(state["mappedSmiles"])
        if molecule is None:
            problems.append(f"state {state_id}: mapped SMILES cannot be read: "
                            f"{state['mappedSmiles']}")
            continue
        map_number_to_element = _map_number_to_element(state_id, molecule, problems)
        for map_number, element in map_number_to_element.items():
            first_state_id, first_element = map_number_to_first_state_and_element.setdefault(
                map_number, (state_id, element))
            if element != first_element:
                problems.append(f"state {state_id}: map number {map_number} is {element} here "
                                f"but {first_element} in state {first_state_id}")
        problems += _coordinate_problems(state_id, list(map_number_to_element),
                                         list(state["mapNumberToCoordinates"]))
    return problems
