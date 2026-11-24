"""Read a state's mapped SMILES into a StateGraph, using RDKit.

The TypeScript twin (src/stateGraphs/mappedSmilesReading.ts) uses its own strict parser instead
of RDKit; both must give the same graph, or the same error code, for the shared cases in
fixtures/state_graphs/mapped_smiles_cases.json. So RDKit here also checks that parser.

Accepted SMILES (the strict subset used by reaction files)
    every atom in brackets with a map number ([CH3:2], [H:4], [O-:1]); Kekulé bonds (-, =, #);
    branches, ring closures and "." between molecules. RDKit reads it without sanitising, so
    bond orders and hydrogen counts stay exactly as written (a Kekulé ring is not re-perceived
    as aromatic).

Error codes (MappedSmilesError.error_code)
    malformed-smiles             not readable SMILES (or empty)
    unmapped-atom                an atom has no map number (including atoms without brackets)
    aromatic-notation            lower-case aromatic atoms or ":" aromatic bonds
    unsupported-smiles-feature   isotopes, stereo marks (@, /, \\), "*" atoms, "$" bonds
    duplicate-map-number         one map number used for two atoms
    unsupported-element          an element without an entry in ELEMENT_TO_VALENCE_ELECTRONS
    impossible-electron-count    more bonds, hydrogens and charge than valence electrons allow
"""
from typing import Dict, Set

from rdkit import Chem, RDLogger

from state_graphs.state_graph import (
    ELEMENT_TO_VALENCE_ELECTRONS,
    BondKey,
    StateAtom,
    StateGraph,
    bond_key,
)

# RDKit prints its own parse errors to stderr; MappedSmilesError already says what went
# wrong.
RDLogger.DisableLog("rdApp.*")  # type: ignore[attr-defined]

RDKIT_BOND_TYPE_TO_ORDER = {
    Chem.BondType.SINGLE: 1, Chem.BondType.DOUBLE: 2, Chem.BondType.TRIPLE: 3,
}


class MappedSmilesError(ValueError):
    """Mapped SMILES that cannot be read into a state graph; `error_code` says why."""

    def __init__(self, error_code: str, message: str) -> None:
        super().__init__(message)
        self.error_code = error_code


def _read_without_sanitising(mapped_smiles: str) -> Chem.Mol:
    """The RDKit molecule exactly as written: no aromaticity perception, explicit H atoms kept."""
    parser_parameters = Chem.SmilesParserParams()
    parser_parameters.sanitize = False
    parser_parameters.removeHs = False
    molecule = Chem.MolFromSmiles(mapped_smiles, parser_parameters) if mapped_smiles else None
    if molecule is None:
        raise MappedSmilesError("malformed-smiles", f'"{mapped_smiles}" is not readable SMILES')
    molecule.UpdatePropertyCache(strict=False)
    return molecule


def _atom_problem(atom: Chem.Atom) -> str:
    """The error code for an atom outside the strict subset, or "" if it is fine."""
    if atom.GetAtomicNum() == 0 or atom.GetIsotope() != 0:
        return "unsupported-smiles-feature"
    if atom.GetChiralTag() != Chem.ChiralType.CHI_UNSPECIFIED:
        return "unsupported-smiles-feature"
    if atom.GetIsAromatic():
        return "aromatic-notation"
    if atom.GetAtomMapNum() == 0:  # RDKit gives 0 to an atom without a map number
        return "unmapped-atom"
    if atom.GetSymbol() not in ELEMENT_TO_VALENCE_ELECTRONS:
        return "unsupported-element"
    return ""


def _bond_problem(bond: Chem.Bond) -> str:
    """The error code for a bond outside the strict subset, or "" if it is fine."""
    if bond.GetIsAromatic() or bond.GetBondType() == Chem.BondType.AROMATIC:
        return "aromatic-notation"
    if bond.GetBondDir() != Chem.BondDir.NONE:
        return "unsupported-smiles-feature"
    if bond.GetBondType() not in RDKIT_BOND_TYPE_TO_ORDER:
        return "unsupported-smiles-feature"
    return ""


def _check_strict_subset(molecule: Chem.Mol, mapped_smiles: str) -> None:
    """Raise MappedSmilesError for the first atom or bond outside the strict subset."""
    used_map_numbers: Set[int] = set()
    for atom in molecule.GetAtoms():
        problem = _atom_problem(atom)
        if not problem and atom.GetAtomMapNum() in used_map_numbers:
            problem = "duplicate-map-number"
        if problem:
            raise MappedSmilesError(
                problem, f'atom {atom.GetSymbol()} in "{mapped_smiles}": {problem}')
        used_map_numbers.add(atom.GetAtomMapNum())
    for bond in molecule.GetBonds():
        problem = _bond_problem(bond)
        if problem:
            raise MappedSmilesError(problem, f'a bond in "{mapped_smiles}": {problem}')


def _nonbonding_electron_count(atom: Chem.Atom, bond_order_sum: int, mapped_smiles: str) -> int:
    """valence electrons - formal charge - bond orders - hydrogen count; refused if negative."""
    # RDKit has no type information, so its counts are converted to int explicitly.
    nonbonding_electron_count = (ELEMENT_TO_VALENCE_ELECTRONS[atom.GetSymbol()]
                                 - int(atom.GetFormalCharge()) - bond_order_sum
                                 - int(atom.GetNumExplicitHs()))
    if nonbonding_electron_count < 0:
        raise MappedSmilesError(
            "impossible-electron-count",
            f'atom {atom.GetSymbol()}{atom.GetAtomMapNum()} in "{mapped_smiles}" has more bonds, '
            "hydrogens and charge than valence electrons")
    return nonbonding_electron_count


def state_graph_from_mapped_smiles(mapped_smiles: str) -> StateGraph:
    """The state graph of one mapped SMILES. Raises MappedSmilesError."""
    molecule = _read_without_sanitising(mapped_smiles)
    _check_strict_subset(molecule, mapped_smiles)
    bond_to_order: Dict[BondKey, int] = {
        bond_key(bond.GetBeginAtom().GetAtomMapNum(), bond.GetEndAtom().GetAtomMapNum()):
            RDKIT_BOND_TYPE_TO_ORDER[bond.GetBondType()]
        for bond in molecule.GetBonds()}
    map_number_to_atom: Dict[int, StateAtom] = {}
    for atom in molecule.GetAtoms():
        map_number = atom.GetAtomMapNum()
        bond_order_sum = sum(order for key, order in bond_to_order.items() if map_number in key)
        # In brackets, RDKit's "explicit" hydrogen count is the H count written in the bracket.
        map_number_to_atom[map_number] = StateAtom(
            map_number=map_number, element=atom.GetSymbol(),
            hydrogen_count=atom.GetNumExplicitHs(),
            nonbonding_electron_count=_nonbonding_electron_count(atom, bond_order_sum,
                                                                 mapped_smiles))
    return StateGraph(map_number_to_atom, bond_to_order)
