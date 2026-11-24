"""Tests for static_file_naming.py: canonical bytes, content hashes, refs and file paths."""
import hashlib

import pytest
from catalogue_building.catalogue_build_errors import CatalogueBuildError
from catalogue_building.static_file_naming import (
    canonical_json_bytes,
    content_hash_of,
    parse_reaction_version_ref,
    reaction_file_path,
    reaction_version_ref,
)


def test_canonical_json_sorts_keys_drops_whitespace_and_keeps_non_ascii() -> None:
    document = {"title": "Br• adds", "a": [1, {"z": None, "b": True}]}
    expected_text = '{"a":[1,{"b":true,"z":null}],"title":"Br• adds"}'
    assert canonical_json_bytes(document) == expected_text.encode("utf-8")


def test_key_order_does_not_change_the_content_hash() -> None:
    assert content_hash_of({"a": 1, "b": 2}) == content_hash_of({"b": 2, "a": 1})


def test_content_hash_is_the_sha256_hex_digest_of_the_canonical_bytes() -> None:
    document = {"reactionSlug": "sn2", "reactionVersion": 1}
    expected_hash = hashlib.sha256(b'{"reactionSlug":"sn2","reactionVersion":1}').hexdigest()
    assert content_hash_of(document) == expected_hash
    assert len(expected_hash) == 64


def test_reaction_version_ref_round_trip() -> None:
    assert reaction_version_ref("aldol-addition-base", 3) == "aldol-addition-base@3"
    assert parse_reaction_version_ref("aldol-addition-base@3") == ("aldol-addition-base", 3)


@pytest.mark.parametrize("bad_ref", ["aldol", "aldol@", "aldol@0", "aldol@x", "Aldol@1", "@1"])
def test_a_malformed_ref_is_refused(bad_ref: str) -> None:
    with pytest.raises(ValueError):
        parse_reaction_version_ref(bad_ref)


def test_reaction_file_path_uses_the_first_eight_hash_characters() -> None:
    content_hash = "0123456789abcdef" * 4
    assert reaction_file_path("sn2", 2, content_hash) == "r/sn2/2.01234567.json"


def test_build_errors_carry_their_code() -> None:
    error = CatalogueBuildError("content-hash-changed", "sn2@1 changed")
    assert error.error_code == "content-hash-changed"
    assert str(error) == "sn2@1 changed"
