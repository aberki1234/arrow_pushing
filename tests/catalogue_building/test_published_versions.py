"""Tests for published_versions.py: reading, the lint gate and version numbering."""
import json
from pathlib import Path
from typing import Any, Callable, Dict, List

import pytest
from catalogue_building.catalogue_build_errors import CatalogueBuildError
from catalogue_building.published_versions import (
    PublishedVersion,
    check_version_numbering,
    read_published_version,
)
from catalogue_building.static_file_naming import content_hash_of

REACTIONS_FOLDER = Path(__file__).resolve().parents[2] / "fixtures" / "reactions"
ReactionCopier = Callable[..., Path]  # the copy_reaction fixture in conftest.py


def read_json(json_path: Path) -> Dict[str, Any]:
    document: Dict[str, Any] = json.loads(json_path.read_text(encoding="utf-8"))
    return document


SN2_SLUG = "sn2-hydroxide-bromomethane"


def test_an_example_reaction_reads_with_its_slug_version_and_hash() -> None:
    reaction_path = REACTIONS_FOLDER / f"{SN2_SLUG}.json"
    published_version, lint_warnings = read_published_version(reaction_path)
    document = read_json(reaction_path)
    assert published_version.reaction_slug == SN2_SLUG
    assert published_version.reaction_version == 1
    assert published_version.reaction_document == document
    assert published_version.content_hash == content_hash_of(document)
    assert published_version.source_path == reaction_path
    assert lint_warnings == []


def test_lint_warnings_are_returned_not_refused(copy_reaction: ReactionCopier) -> None:
    reaction_path = copy_reaction(SN2_SLUG)
    document = read_json(reaction_path)
    document["stateIdToState"]["reactants"]["hintTiers"] = ["One hint."]
    reaction_path.write_text(json.dumps(document), encoding="utf-8")
    _, lint_warnings = read_published_version(reaction_path)
    assert [finding.lint_rule_id for finding in lint_warnings] == ["fewer-than-three-hint-tiers"]


def test_a_lint_error_refuses_the_file_and_names_the_rule(copy_reaction: ReactionCopier) -> None:
    reaction_path = copy_reaction(SN2_SLUG, difficultyTier=7)
    with pytest.raises(CatalogueBuildError) as raised:
        read_published_version(reaction_path)
    assert raised.value.error_code == "reaction-file-has-lint-errors"
    assert str(reaction_path) in str(raised.value)
    assert "schema-violation" in str(raised.value)


@pytest.mark.parametrize("file_text", [None, "{not json"])
def test_a_missing_or_broken_file_is_refused(tmp_path: Path, file_text: Any) -> None:
    reaction_path = tmp_path / "broken.json"
    if file_text is not None:
        reaction_path.write_text(file_text, encoding="utf-8")
    with pytest.raises(CatalogueBuildError) as raised:
        read_published_version(reaction_path)
    assert raised.value.error_code == "reaction-file-not-readable"


def stand_in_version(reaction_slug: str, reaction_version: int) -> PublishedVersion:
    document: Dict[str, Any] = {"reactionSlug": reaction_slug, "reactionVersion": reaction_version}
    return PublishedVersion(reaction_slug, reaction_version, document,
                            content_hash_of(document), Path(f"{reaction_slug}@{reaction_version}"))


def versions(*refs: str) -> List[PublishedVersion]:
    return [stand_in_version(ref.split("@")[0], int(ref.split("@")[1])) for ref in refs]


def test_consecutive_versions_in_any_order_pass() -> None:
    check_version_numbering(versions("sn2@2", "aldol@1", "sn2@1", "sn2@3"))


@pytest.mark.parametrize(("refs", "expected_error_code"), [
    (("sn2@1", "sn2@1"), "reaction-version-duplicated"),
    (("sn2@1", "sn2@3"), "reaction-versions-not-consecutive"),
    (("aldol@1", "sn2@2"), "reaction-versions-not-consecutive"),
])
def test_bad_version_numbering_is_refused(refs: List[str], expected_error_code: str) -> None:
    with pytest.raises(CatalogueBuildError) as raised:
        check_version_numbering(versions(*refs))
    assert raised.value.error_code == expected_error_code
    assert "sn2" in str(raised.value)
