/**
 * The HTTP answer to each refusal of the reaction database (reactionDatabaseErrors.ts).
 *
 *   400  document-has-no-slug
 *   403  not-reaction-owner, not-allowed-to-publish
 *   404  reaction-not-found, version-not-found
 *   409  no-unpublished-version, unpublished-version-exists (the reaction's state conflicts)
 *   422  draft-has-lint-errors, licence-not-agreed (the draft cannot be published as it is)
 */
import type { LintFinding } from "../reactionLinting/lintFindings.js";
import type {
  ReactionDatabaseError,
  RefusalCode,
} from "../reactionDatabase/reactionDatabaseErrors.js";

export type RefusalHttpStatus = 400 | 403 | 404 | 409 | 422;

export interface RefusalBody {
  readonly error: string;
  readonly refusalCode: RefusalCode;
  /** Only for draft-has-lint-errors. */
  readonly lintFindings?: readonly LintFinding[];
}

const REFUSAL_CODE_TO_HTTP_STATUS: Record<RefusalCode, RefusalHttpStatus> = {
  "document-has-no-slug": 400,
  "not-reaction-owner": 403,
  "not-allowed-to-publish": 403,
  "reaction-not-found": 404,
  "version-not-found": 404,
  "no-unpublished-version": 409,
  "unpublished-version-exists": 409,
  "draft-has-lint-errors": 422,
  "licence-not-agreed": 422,
};

export function refusalHttpStatus(refusalCode: RefusalCode): RefusalHttpStatus {
  return REFUSAL_CODE_TO_HTTP_STATUS[refusalCode];
}

export function refusalBody(refusal: ReactionDatabaseError): RefusalBody {
  const codeAndMessage = { error: refusal.message, refusalCode: refusal.refusalCode };
  return refusal.refusalCode === "draft-has-lint-errors"
    ? { ...codeAndMessage, lintFindings: refusal.lintFindings }
    : codeAndMessage;
}
