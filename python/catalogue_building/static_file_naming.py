"""Names and bytes of the static files: reaction version refs, content hashes, file paths.

Terms (docs/schema-design.md sections 0 and 1)
    reaction version ref  "<reaction slug>@<reaction version>", e.g. "aldol-addition-base@3".
    canonical JSON        The document with sorted keys, no whitespace, UTF-8, non-ASCII characters
                          written as they are. The static reaction file holds exactly these bytes.
    content hash          The sha256 hex digest (64 characters) of the canonical JSON.
    reaction file path    "r/<slug>/<version>.<first 8 characters of the content hash>.json",
                          relative to the site root.
"""
import hashlib
import json
import re
from typing import Any, Mapping, Tuple

CONTENT_HASH_CHARACTERS_IN_FILE_NAME = 8
# The slug pattern of docs/schema-design.md section 1, then "@" and a version from 1.
REACTION_VERSION_REF_PATTERN = re.compile(r"([a-z0-9]+(?:-[a-z0-9]+)*)@([1-9][0-9]*)")


def canonical_json_bytes(document: Mapping[str, Any]) -> bytes:
    """Sorted keys, no whitespace, UTF-8 with non-ASCII characters as they are."""
    canonical_text = json.dumps(document, sort_keys=True, separators=(",", ":"),
                                ensure_ascii=False)
    return canonical_text.encode("utf-8")


def content_hash_of(document: Mapping[str, Any]) -> str:
    """The sha256 hex digest (64 characters) of the document's canonical JSON."""
    return hashlib.sha256(canonical_json_bytes(document)).hexdigest()


def reaction_version_ref(reaction_slug: str, reaction_version: int) -> str:
    return f"{reaction_slug}@{reaction_version}"


def parse_reaction_version_ref(version_ref: str) -> Tuple[str, int]:
    """"aldol@3" -> ("aldol", 3). Raises ValueError for text that is not a reaction version ref."""
    ref_match = REACTION_VERSION_REF_PATTERN.fullmatch(version_ref)
    if ref_match is None:
        raise ValueError(f"not a reaction version ref (<slug>@<version>): {version_ref!r}")
    return ref_match.group(1), int(ref_match.group(2))


def reaction_file_path(reaction_slug: str, reaction_version: int, content_hash: str) -> str:
    """"r/<slug>/<version>.<first 8 characters of the content hash>.json"."""
    short_hash = content_hash[:CONTENT_HASH_CHARACTERS_IN_FILE_NAME]
    return f"r/{reaction_slug}/{reaction_version}.{short_hash}.json"
