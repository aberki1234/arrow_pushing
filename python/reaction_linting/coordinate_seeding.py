"""Seed a state's 2D coordinates from RDKit, for states the author has not laid out.

Purpose
    The renderer draws each state from mapNumberToCoordinates (docs/schema-design.md section
    3.2). A new state, or one whose atoms changed, gets a first layout from RDKit's depiction;
    the editor tidies it later. Coordinates are in RDKit units (a bond about 1.5 long), y up,
    rounded to COORDINATE_DECIMAL_PLACES, so no conversion is needed.

Steps
    1. seeded_coordinates() lays out one mapped SMILES.
    2. seed_missing_coordinates() replaces the coordinates of every state whose coordinate keys
       are not exactly its map numbers (missing, incomplete or stale), and leaves the rest.
"""
from typing import Any, Dict, List

from rdkit import Chem, RDLogger
from rdkit.Chem import rdDepictor

# RDKit prints its own parse errors to stderr; the ValueError already says which SMILES failed.
RDLogger.DisableLog("rdApp.*")  # type: ignore[attr-defined]

COORDINATE_DECIMAL_PLACES = 2  # 0.01 RDKit units: far below what a screen shows


def seeded_coordinates(mapped_smiles: str) -> Dict[str, List[float]]:
    """{map number as text: [x, y]} for every atom of the mapped SMILES (explicit H included).
    Raises ValueError if RDKit cannot read it."""
    parser_parameters = Chem.SmilesParserParams()
    parser_parameters.removeHs = False  # explicit hydrogens such as [H:4] are drawn atoms
    molecule = Chem.MolFromSmiles(mapped_smiles, parser_parameters)
    if molecule is None:
        raise ValueError(f'RDKit cannot read "{mapped_smiles}"')
    rdDepictor.Compute2DCoords(molecule)
    conformer = molecule.GetConformer()
    map_number_to_position = {
        atom.GetAtomMapNum(): conformer.GetAtomPosition(atom.GetIdx())
        for atom in molecule.GetAtoms()}
    return {str(map_number): [round(float(position.x), COORDINATE_DECIMAL_PLACES),
                              round(float(position.y), COORDINATE_DECIMAL_PLACES)]
            for map_number, position in sorted(map_number_to_position.items())}


def seed_missing_coordinates(reaction_document: Dict[str, Any]) -> List[str]:
    """Seed, in place, each state whose coordinates do not cover exactly its mapped atoms.
    States whose SMILES cannot be read are skipped (the linter reports them).
    Returns the ids of the states seeded, in stateIdToState order."""
    seeded_state_ids = []
    for state_id, state in reaction_document["stateIdToState"].items():
        try:
            coordinates = seeded_coordinates(state["mappedSmiles"])
        except ValueError:
            continue
        if set(state.get("mapNumberToCoordinates", {})) != set(coordinates):
            state["mapNumberToCoordinates"] = coordinates
            seeded_state_ids.append(state_id)
    return seeded_state_ids
