/**
 * Refusals of the reaction database: a request that the rules of docs/SPEC.md §5 (backend) do not
 * allow. The server turns each refusal code into an HTTP answer.
 */
import type { LintFinding } from "../../tooling/reactionLinting/findings/lintFindings.js";

export type RefusalCode =
  | "document-has-no-slug"
  | "no-unpublished-version"
  | "unpublished-version-exists"
  | "reaction-not-found"
  | "version-not-found"
  | "not-allowed-to-publish"
  | "draft-has-lint-errors"
  | "licence-not-agreed"
  | "not-version-author"
  | "not-allowed"
  | "too-many-open-drafts"
  | "not-submittable"
  | "not-submitted"
  | "own-submission"
  | "user-not-found"
  | "role-not-assignable"
  | "access-token-not-found"
  | "draft-changed";

export class ReactionDatabaseError extends Error {
  override readonly name = "ReactionDatabaseError";

  constructor(
    readonly refusalCode: RefusalCode,
    message: string,
    /** For draft-has-lint-errors: every finding of the lint, errors and warnings. */
    readonly lintFindings: readonly LintFinding[] = [],
  ) {
    super(message);
  }
}
