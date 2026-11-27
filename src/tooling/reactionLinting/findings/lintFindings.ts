/**
 * What the linter reports: one lint finding per broken rule.
 *
 * Terms (docs/schema-design.md §0)
 *   lint finding   One broken lint rule at one place in a reaction file: the rule id, the lint
 *                  level, a JSON pointer to the place, and a message for the author. The object
 *                  is already in the JSON shape of the lint report.
 *   lint level     "error" blocks submission (a cross in the editor's lint panel); "warning" is
 *                  advice. Not to be confused with a misconception's severity (wrong / plausible).
 *   instance path  A JSON pointer such as "/steps/0/canonicalArrows" ("" is the whole file).
 */
import { jsonPointer } from "../../../core/reactionFiles/schemaViolations.js";

export type LintLevel = "error" | "warning";

export interface LintFinding {
  readonly lintRuleId: string;
  readonly lintLevel: LintLevel;
  readonly instancePath: string;
  readonly message: string;
}

/** Keys and list positions leading to the place a finding points at. */
export type PathPart = string | number;

/** An error-level finding at the JSON pointer made from `pathParts`. */
export function lintError(
  lintRuleId: string,
  pathParts: readonly PathPart[],
  message: string,
): LintFinding {
  return { lintRuleId, lintLevel: "error", instancePath: jsonPointer(pathParts), message };
}

/** A warning-level finding at the JSON pointer made from `pathParts`. */
export function lintWarning(
  lintRuleId: string,
  pathParts: readonly PathPart[],
  message: string,
): LintFinding {
  return { lintRuleId, lintLevel: "warning", instancePath: jsonPointer(pathParts), message };
}
