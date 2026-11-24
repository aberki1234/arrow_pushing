"""The state graph: the atoms and bonds of one drawn state, with each atom's electrons counted.

Purpose
    Applying curved arrows, comparing states and checking octets all need the electrons of each
    atom, not just the connectivity. This module holds that model. Formal charge and lone pairs
    are derived from the electron counts, never stored, so moving electrons always keeps the
    charge bookkeeping right.

Terms (docs/schema-design.md section 0)
    map number                 Names one atom for the whole reaction.
    hydrogen count             Implicit hydrogens on an atom (those not drawn as mapped atoms).
    nonbonding electron count  Electrons on the atom that are not in a bond: its lone pairs plus
                               any unpaired electron.
    bond order                 1, 2 or 3; keyed by the two map numbers, the smaller first.

Electron bookkeeping, per atom
    formal charge     = valence electrons - nonbonding electrons - bond orders - hydrogen count
    unpaired electron = 1 if the nonbonding count is odd, else 0 (an atom with two unpaired
                        electrons, e.g. a triplet carbene, is out of scope)
    lone pairs        = nonbonding electrons // 2
    valence shell     = nonbonding electrons + 2 * (bond orders + hydrogen count)
Worked example: hydroxide [OH-] has 6 valence electrons, charge -1, no bonds and one H, so
6 - nonbonding - 0 - 1 = -1 gives 6 nonbonding electrons: three lone pairs.
"""
from dataclasses import dataclass
from typing import Any, Dict, Tuple

# Valence electrons of each element the content may use (main-group group number).
ELEMENT_TO_VALENCE_ELECTRONS: Dict[str, int] = {
    "H": 1, "Li": 1, "B": 3, "C": 4, "N": 5, "O": 6, "F": 7,
    "Na": 1, "Mg": 2, "Al": 3, "Si": 4, "P": 5, "S": 6, "Cl": 7,
    "K": 1, "Br": 7, "I": 7,
}

# Periodic-table period of each element, which sets the most valence-shell electrons it may have.
ELEMENT_TO_PERIOD: Dict[str, int] = {
    "H": 1, "Li": 2, "B": 2, "C": 2, "N": 2, "O": 2, "F": 2,
    "Na": 3, "Mg": 3, "Al": 3, "Si": 3, "P": 3, "S": 3, "Cl": 3,
    "K": 4, "Br": 4, "I": 5,
}

# Most valence-shell electrons by period: the duet for H, the octet for period 2, and an
# expanded shell (e.g. P in Ph3P=O, S in sulfones) allowed up to 12 from period 3 on.
PERIOD_TO_MAXIMUM_VALENCE_SHELL_ELECTRONS: Dict[int, int] = {1: 2, 2: 8}
EXPANDED_SHELL_MAXIMUM_ELECTRONS = 12

BondKey = Tuple[int, int]


@dataclass(frozen=True)
class StateAtom:
    map_number: int
    element: str
    hydrogen_count: int
    nonbonding_electron_count: int


@dataclass(frozen=True)
class StateGraph:
    """`bond_to_order` is keyed by (smaller map number, larger map number). Treat both mappings
    as read-only: functions that change a state return a new StateGraph."""
    map_number_to_atom: Dict[int, StateAtom]
    bond_to_order: Dict[BondKey, int]


def bond_key(first_map_number: int, second_map_number: int) -> BondKey:
    """The key of the bond between two atoms: the smaller map number first."""
    return (min(first_map_number, second_map_number), max(first_map_number, second_map_number))


def bond_order_sum(graph: StateGraph, map_number: int) -> int:
    """The sum of the orders of the atom's bonds to other mapped atoms (implicit H excluded)."""
    return sum(order for key, order in graph.bond_to_order.items() if map_number in key)


def formal_charge(graph: StateGraph, map_number: int) -> int:
    """valence electrons - nonbonding electrons - bond orders - hydrogen count."""
    atom = graph.map_number_to_atom[map_number]
    return (ELEMENT_TO_VALENCE_ELECTRONS[atom.element] - atom.nonbonding_electron_count
            - bond_order_sum(graph, map_number) - atom.hydrogen_count)


def lone_pair_count(atom: StateAtom) -> int:
    return atom.nonbonding_electron_count // 2


def unpaired_electron_count(atom: StateAtom) -> int:
    return atom.nonbonding_electron_count % 2


def valence_shell_electron_count(graph: StateGraph, map_number: int) -> int:
    """nonbonding electrons + 2 * (bond orders + hydrogen count)."""
    atom = graph.map_number_to_atom[map_number]
    shared_pair_count = bond_order_sum(graph, map_number) + atom.hydrogen_count
    return atom.nonbonding_electron_count + 2 * shared_pair_count


def maximum_valence_shell_electrons(element: str) -> int:
    """2 for H, 8 for period 2, 12 from period 3 on."""
    period = ELEMENT_TO_PERIOD[element]
    return PERIOD_TO_MAXIMUM_VALENCE_SHELL_ELECTRONS.get(period, EXPANDED_SHELL_MAXIMUM_ELECTRONS)


def state_graph_to_json(graph: StateGraph) -> Dict[str, Any]:
    """The fixture spelling: {"atoms": [...], "bonds": [...]}, atoms by map number, bonds by key."""
    atoms = [{"mapNumber": atom.map_number, "element": atom.element,
              "hydrogenCount": atom.hydrogen_count,
              "nonbondingElectronCount": atom.nonbonding_electron_count}
             for _, atom in sorted(graph.map_number_to_atom.items())]
    bonds = [{"mapNumbers": list(key), "bondOrder": order}
             for key, order in sorted(graph.bond_to_order.items())]
    return {"atoms": atoms, "bonds": bonds}
