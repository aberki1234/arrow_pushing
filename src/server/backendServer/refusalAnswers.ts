/**
 * The HTTP answer to each refusal of the reaction database (reactionDatabaseErrors.ts).
 *
 *   400  document-has-no-slug, role-not-assignable
 *   403  not-allowed-to-publish, not-version-author, not-allowed, own-submission
 *   404  reaction-not-found, version-not-found, user-not-found, access-token-not-found
 *   409  no-unpublished-version, unpublished-version-exists, too-many-open-drafts,
 *        not-submittable, not-submitted, draft-changed (the reaction's state conflicts)
 *   422  draft-has-lint-errors, licence-not-agreed (the draft cannot be published as it is)
 */
import type { LintFinding } from "../../tooling/reactionLinting/findings/lintFindings.js";
import type {
  ReactionDatabaseError,
  RefusalCode,
} from "../reactionDatabase/model/reactionDatabaseErrors.js";

export type RefusalHttpStatus = 400 | 403 | 404 | 409 | 422;

export interface RefusalBody {
  readonly error: string;
  readonly refusalCode: RefusalCode;
  /** Only for draft-has-lint-errors. */
  readonly lintFindings?: readonly LintFinding[];
}

const REFUSAL_CODE_TO_HTTP_STATUS: Record<RefusalCode, RefusalHttpStatus> = {
  "document-has-no-slug": 400,
  "not-allowed-to-publish": 403,
  "reaction-not-found": 404,
  "version-not-found": 404,
  "no-unpublished-version": 409,
  "unpublished-version-exists": 409,
  "draft-has-lint-errors": 422,
  "licence-not-agreed": 422,
  "not-version-author": 403,
  "not-allowed": 403,
  "own-submission": 403,
  "too-many-open-drafts": 409,
  "not-submittable": 409,
  "not-submitted": 409,
  "user-not-found": 404,
  "role-not-assignable": 400,
  "access-token-not-found": 404,
  "draft-changed": 409,
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
