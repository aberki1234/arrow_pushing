/**
 * The core of the editor's lint worker (reactionEditor/io/lintWorker.ts): each request carries a
 * draft and an id; the answer carries the same id and the draft's lint findings, so the page can
 * drop answers to drafts it has since changed. RDKit is loaded once, when the first request
 * comes. A draft the linter cannot read at all gives one "lint-failed" error.
 */
import type { ChemistryToolkit } from "../../../tooling/chemistryToolkit/chemistryToolkit.js";
import type { LintFinding } from "../../../tooling/reactionLinting/lintFindings.js";
import { lintReaction } from "../../../tooling/reactionLinting/reactionLint.js";

export interface LintRequest {
  readonly requestId: number;
  readonly document: unknown;
}

export interface LintAnswer {
  readonly requestId: number;
  readonly lintFindings: readonly LintFinding[];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function lintRequestAnswerer(
  toolkitLoading: Promise<ChemistryToolkit>,
): (request: LintRequest) => Promise<LintAnswer> {
  return async ({ requestId, document }) => {
    try {
      if (!isRecord(document)) {
        throw new Error("the draft is not a JSON object");
      }
      return { requestId, lintFindings: lintReaction(document, await toolkitLoading) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        requestId,
        lintFindings: [
          { lintRuleId: "lint-failed", lintLevel: "error", instancePath: "", message },
        ],
      };
    }
  };
}
