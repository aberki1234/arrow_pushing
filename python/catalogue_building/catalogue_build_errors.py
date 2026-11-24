"""Why a catalogue build refuses to produce anything.

Error codes
    reaction-file-not-readable       an input file is missing or not JSON
    reaction-file-has-lint-errors    an input file fails the schema or has a lint error
    reaction-version-duplicated      two input files hold the same slug and version
    reaction-versions-not-consecutive  a slug's versions are not exactly 1..n
    previous-catalogue-not-readable  --previous-catalogue is missing or not JSON
    previous-catalogue-invalid       the previous catalogue breaks schema/catalogue.schema.json
    published-version-missing        a version in the previous catalogue is not among the inputs
    content-hash-changed             a published version's content differs from the previous build
    calendar-ref-not-published       a calendar date names a version that is not among the inputs
    no-eligible-reactions            the calendar needs new dates but no reaction is eligible
    output-folder-not-empty          the output folder already holds files
"""


class CatalogueBuildError(Exception):
    """`error_code` is one of the codes above; the message says where and why, for people."""

    def __init__(self, error_code: str, message: str) -> None:
        super().__init__(message)
        self.error_code = error_code
