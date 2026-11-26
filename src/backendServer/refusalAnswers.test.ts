/**
 * Tests for refusalAnswers.ts: every refusal code has the status of the module comment's table.
 */
import { describe, expect, it } from "vitest";
import {
  ReactionDatabaseError,
  type RefusalCode,
} from "../reactionDatabase/reactionDatabaseErrors.js";
import { refusalBody, refusalHttpStatus } from "./refusalAnswers.js";

const CODE_TO_STATUS: Record<RefusalCode, number> = {
  "document-has-no-slug": 400,
  "role-not-assignable": 400,
  "not-allowed-to-publish": 403,
  "not-version-author": 403,
  "not-allowed": 403,
  "own-submission": 403,
  "reaction-not-found": 404,
  "version-not-found": 404,
  "user-not-found": 404,
  "no-unpublished-version": 409,
  "unpublished-version-exists": 409,
  "too-many-open-drafts": 409,
  "not-submittable": 409,
  "not-submitted": 409,
  "draft-has-lint-errors": 422,
  "licence-not-agreed": 422,
};

describe("refusal answers", () => {
  it("gives each refusal code its status", () => {
    for (const [refusalCode, httpStatus] of Object.entries(CODE_TO_STATUS)) {
      expect(refusalHttpStatus(refusalCode as RefusalCode)).toBe(httpStatus);
    }
  });

  it("carries the message and code, and lint findings only for lint errors", () => {
    expect(refusalBody(new ReactionDatabaseError("reaction-not-found", "no reaction x"))).toEqual({
      error: "no reaction x",
      refusalCode: "reaction-not-found",
    });
    const finding = {
      lintRuleId: "schema-violation",
      lintLevel: "error",
      instancePath: "/title",
      message: "must not be empty",
    } as const;
    expect(
      refusalBody(new ReactionDatabaseError("draft-has-lint-errors", "lint errors", [finding])),
    ).toEqual({
      error: "lint errors",
      refusalCode: "draft-has-lint-errors",
      lintFindings: [finding],
    });
  });
});
