"""Read the published reaction files a build starts from; refuse any not fit to publish.

Terms
    published version  One reaction file given to the build: its slug, version, parsed document
                       and content hash (static_file_naming).
Steps
    1. read_published_version() reads one file, lints it (reaction_linting) and refuses it on any
       lint error; lint warnings are returned for the command line to print.
    2. check_version_numbering() refuses a slug/version given twice and a slug whose versions
       are not exactly 1..n.
"""
import json
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, DefaultDict, Dict, List, Sequence, Tuple

from reaction_linting.lint_findings import LintFinding, LintLevel
from reaction_linting.reaction_lint import lint_reaction

from catalogue_building.catalogue_build_errors import CatalogueBuildError
from catalogue_building.static_file_naming import content_hash_of, reaction_version_ref


@dataclass(frozen=True)
class PublishedVersion:
    reaction_slug: str
    reaction_version: int
    reaction_document: Dict[str, Any]
    content_hash: str
    source_path: Path


def _finding_line(lint_finding: LintFinding) -> str:
    return (f"{lint_finding.lint_rule_id} at {lint_finding.instance_path or '/'}: "
            f"{lint_finding.message}")


def read_published_version(reaction_path: Path) -> Tuple[PublishedVersion, List[LintFinding]]:
    """The file as a published version, and its lint warnings. Raises CatalogueBuildError
    reaction-file-not-readable or reaction-file-has-lint-errors (listing every error)."""
    try:
        reaction_document: Dict[str, Any] = json.loads(reaction_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise CatalogueBuildError("reaction-file-not-readable",
                                  f"{reaction_path}: {error}") from error
    lint_findings = lint_reaction(reaction_document)
    lint_errors = [finding for finding in lint_findings if finding.lint_level == LintLevel.ERROR]
    if lint_errors:
        raise CatalogueBuildError(
            "reaction-file-has-lint-errors",
            f"{reaction_path}: " + "; ".join(_finding_line(finding) for finding in lint_errors))
    published_version = PublishedVersion(
        reaction_document["reactionSlug"], reaction_document["reactionVersion"],
        reaction_document, content_hash_of(reaction_document), reaction_path)
    return published_version, lint_findings


def check_version_numbering(published_versions: Sequence[PublishedVersion]) -> None:
    """Raises CatalogueBuildError reaction-version-duplicated or
    reaction-versions-not-consecutive (a slug's versions must be exactly 1..n)."""
    slug_to_versions: DefaultDict[str, List[PublishedVersion]] = defaultdict(list)
    for published_version in published_versions:
        slug_to_versions[published_version.reaction_slug].append(published_version)
    for reaction_slug, slug_versions in sorted(slug_to_versions.items()):
        version_numbers = sorted(version.reaction_version for version in slug_versions)
        for earlier_number, later_number in zip(version_numbers, version_numbers[1:],
                                                strict=False):
            if earlier_number == later_number:
                duplicated_paths = [str(version.source_path) for version in slug_versions
                                    if version.reaction_version == later_number]
                raise CatalogueBuildError(
                    "reaction-version-duplicated",
                    f"{reaction_version_ref(reaction_slug, later_number)} is given twice: "
                    + ", ".join(duplicated_paths))
        if version_numbers != list(range(1, len(version_numbers) + 1)):
            raise CatalogueBuildError(
                "reaction-versions-not-consecutive",
                f"{reaction_slug} has versions {version_numbers}; they must be 1 to "
                f"{len(version_numbers)} with none missing")
