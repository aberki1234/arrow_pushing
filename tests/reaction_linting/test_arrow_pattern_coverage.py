"""Tests for arrow_pattern_coverage.py.

Each expectation follows from the matching rules in attempt_assessment/arrow_patterns.py: a wider
pattern covers a narrower one only if every arrow set matching the narrower one also matches the
wider one. Cases where that holds but the test cannot prove it (a bare atom against a bond
destination) are expected False: the test is sound, not complete.
"""
from typing import Dict, List

import pytest
from attempt_assessment.arrow_patterns import parse_arrow_pattern
from reaction_linting.arrow_pattern_coverage import arrow_pattern_covers

ROLES: Dict[str, List[int]] = {"nucleophile": [1], "halogens": [3, 5]}


@pytest.mark.parametrize("wider_text, narrower_text, expected_covers", [
    ("lp O1 -> Br3", "lp O1 -> Br3", True),                       # the same pattern
    ("lp O1 -> Br3", "lp O1 -> Br3; σ C2-Br3 -> lp Br3", True),   # fewer arrows required
    ("lp O1 -> Br3; σ C2-Br3 -> lp Br3", "lp O1 -> Br3", False),  # more arrows required
    ("lp O* -> Br3", "lp O1 -> Br3", True),                       # any O covers O1
    ("lp O1 -> Br3", "lp O* -> Br3", False),
    ("lp * -> Br3", "lp @nucleophile -> Br3", True),
    ("lp O* -> Br3", "lp @nucleophile -> Br3", False),            # a role's element is unknown
    ("lp @nucleophile -> Br3", "lp O1 -> Br3", True),             # role {1} covers map number 1
    ("lp O1 -> @halogens", "lp O1 -> Br3", True),
    ("lp O1 -> Br3", "lp O1 -> @halogens", False),
    ("* *> Br3", "lp O1 -> Br3", True),                           # "*>" covers both arrow types
    ("lp O1 -> Br3", "lp O1 *> Br3", False),
    ("lp O1 ~> Br3", "lp O1 -> Br3", False),
    ("bond C2-Br3 -> lp Br3", "σ Br3-C2 -> lp Br3", True),        # bond atoms in either order
    ("σ C2-Br3 -> lp Br3", "bond C2-Br3 -> lp Br3", False),
    ("* C2-Br3 -> lp Br3", "π C2-Br3 -> lp Br3", True),
    ("* O1 -> Br3", "rad O1 -> Br3", True),
    ("* O1 -> Br3", "σ O1-C2 -> Br3", False),
    ("lp O1 -> Br3", "lp O1 -> lp Br3", True),                    # bare atom covers lp on it
    ("lp O1 -> Br3", "lp O1 -> σ O1-Br3", False),                 # bond destination: not proved
    ("lp O1 -> lp Br3", "lp O1 -> Br3", False),                   # bare atom also means bonds
    ("lp O1 -> *", "lp O1 -> Br3", True),                         # a lone "*" covers everything
    ("lp O1 -> *", "lp O1 -> σ O1-C2", True),
])
def test_arrow_pattern_covers(wider_text: str, narrower_text: str, expected_covers: bool) -> None:
    wider_pattern = parse_arrow_pattern(wider_text, ROLES)
    narrower_pattern = parse_arrow_pattern(narrower_text, ROLES)
    assert arrow_pattern_covers(wider_pattern, narrower_pattern) is expected_covers
