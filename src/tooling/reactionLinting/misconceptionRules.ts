/**
 * Lint rules on the misconceptions of each state (docs/schema-design.md §3.5 and §5.2).
 *
 * Rules
 *   duplicate-misconception-id          error    two misconceptions in the reaction share an id
 *                                                (progress records name them by id)
 *   misconception-pattern-invalid       error    the arrowPattern cannot be parsed, or names a
 *                                                role missing from atomRoleToMapNumbers
 *   misconception-hides-correct-answer  error    (rule 7) the pattern matches, up to skeleton
 *                                                symmetry, an arrow set of a leaving step that
 *                                                the validator accepts (canonical arrows or a
 *                                                partial arrow set)
 *   misconception-never-fires           warning  an earlier entry on the same state covers this
 *                                                one (arrowPatternCoverage), so it always wins
 *
 * Steps
 *   misconceptionTextFindings() needs only the document (the first two rules). The others need the
 *   reaction prepared for assessment from withoutInvalidPatterns(), which keeps only the
 *   misconceptions whose patterns parse.
 */
import {
  ArrowPatternError,
  arrowPatternMatches,
  parseArrowPattern,
} from "../../core/attemptAssessment/arrowPatterns.js";
import {
  type PreparedReaction,
  symmetriesOf,
} from "../../core/attemptAssessment/preparedReaction.js";
import { relabelCurvedArrow } from "../../core/attemptAssessment/skeletonSymmetry.js";
import { arrowPatternCovers } from "./arrowPatternCoverage.js";
import type { LintedReaction } from "./lintedReaction.js";
import { type LintFinding, lintError, lintWarning, type PathPart } from "./lintFindings.js";
import { assessForStepAlone } from "./stepReproduction.js";

type DocumentRecord = Readonly<Record<string, unknown>>;

function isDocumentRecord(value: unknown): value is DocumentRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWritableRecord(value: unknown): value is Record<string, unknown> {
  return isDocumentRecord(value);
}

function misconceptionPath(stateId: string, position: number): PathPart[] {
  return ["stateIdToState", stateId, "misconceptions", position];
}

function patternParses(reaction: LintedReaction, patternText: string): boolean {
  try {
    parseArrowPattern(patternText, reaction.atomRoleToMapNumbers);
  } catch (error) {
    if (error instanceof ArrowPatternError) {
      return false;
    }
    throw error;
  }
  return true;
}

/**
 * The positions, in the state's misconception list, of the entries whose patterns parse: position
 * k of the prepared reaction's list is the entry at the k-th of these.
 */
function positionsOfParsablePatterns(reaction: LintedReaction, stateId: string): number[] {
  const misconceptions = reaction.stateIdToState.get(stateId)?.misconceptions ?? [];
  return misconceptions.flatMap((misconception, position) =>
    patternParses(reaction, misconception.arrowPattern) ? [position] : [],
  );
}

/**
 * A copy of the document without the misconceptions whose patterns do not parse, so that
 * prepareReaction() can read it.
 */
export function withoutInvalidPatterns(
  reactionDocument: DocumentRecord,
  reaction: LintedReaction,
): Record<string, unknown> {
  const documentCopy = structuredClone({ ...reactionDocument });
  const states = isDocumentRecord(documentCopy.stateIdToState) ? documentCopy.stateIdToState : {};
  for (const [stateId, state] of Object.entries(states)) {
    if (isWritableRecord(state) && Array.isArray(state.misconceptions)) {
      const misconceptions: unknown[] = state.misconceptions;
      state.misconceptions = positionsOfParsablePatterns(reaction, stateId).map(
        (position) => misconceptions[position],
      );
    }
  }
  return documentCopy;
}

/**
 * duplicate-misconception-id and misconception-pattern-invalid, at
 * "/stateIdToState/<state id>/misconceptions/<position>".
 */
export function misconceptionTextFindings(reaction: LintedReaction): LintFinding[] {
  const seenIds = new Set<string>();
  const findings: LintFinding[] = [];
  for (const [stateId, state] of reaction.stateIdToState) {
    state.misconceptions.forEach(({ misconceptionId, arrowPattern }, position) => {
      if (seenIds.has(misconceptionId)) {
        findings.push(
          lintError(
            "duplicate-misconception-id",
            misconceptionPath(stateId, position),
            `misconception id "${misconceptionId}" is used by an earlier misconception`,
          ),
        );
      }
      seenIds.add(misconceptionId);
      try {
        parseArrowPattern(arrowPattern, reaction.atomRoleToMapNumbers);
      } catch (error) {
        if (!(error instanceof ArrowPatternError)) {
          throw error;
        }
        findings.push(
          lintError(
            "misconception-pattern-invalid",
            misconceptionPath(stateId, position),
            `${error.errorCode}: ${error.message}`,
          ),
        );
      }
    });
  }
  return findings;
}

/** Rule 7: a misconception matching, up to symmetry, an accepted known arrow set. */
function hiddenCorrectAnswerFindings(
  prepared: PreparedReaction,
  stateId: string,
  positions: readonly number[],
): LintFinding[] {
  const acceptedArrowSets = (prepared.stateIdToLeavingSteps.get(stateId) ?? []).flatMap((step) =>
    step.knownArrowSets.filter(
      (arrowSet) => assessForStepAlone(prepared, step, stateId, arrowSet) !== undefined,
    ),
  );
  const symmetries = symmetriesOf(prepared, stateId);
  const misconceptions = prepared.stateIdToMisconceptions.get(stateId) ?? [];
  return misconceptions.flatMap((misconception, index) => {
    const hidesAnswer = acceptedArrowSets.some((arrowSet) =>
      symmetries.some((symmetry) =>
        arrowPatternMatches(
          misconception.arrowPattern,
          arrowSet.map((curvedArrow) => relabelCurvedArrow(curvedArrow, symmetry)),
        ),
      ),
    );
    return hidesAnswer
      ? [
          lintError(
            "misconception-hides-correct-answer",
            misconceptionPath(stateId, positions[index] ?? index),
            `misconception "${misconception.misconceptionId}" matches arrows that are accepted ` +
              "for a step leaving this state, so it would hide a correct answer",
          ),
        ]
      : [];
  });
}

function neverFiringFindings(
  prepared: PreparedReaction,
  stateId: string,
  positions: readonly number[],
): LintFinding[] {
  const misconceptions = prepared.stateIdToMisconceptions.get(stateId) ?? [];
  return misconceptions.flatMap((later, laterIndex) => {
    const earlierCovering = misconceptions
      .slice(0, laterIndex)
      .find((earlier) => arrowPatternCovers(earlier.arrowPattern, later.arrowPattern));
    return earlierCovering === undefined
      ? []
      : [
          lintWarning(
            "misconception-never-fires",
            misconceptionPath(stateId, positions[laterIndex] ?? laterIndex),
            `misconception "${later.misconceptionId}" never fires: the earlier ` +
              `"${earlierCovering.misconceptionId}" matches whatever it matches`,
          ),
        ];
  });
}

/**
 * misconception-hides-correct-answer and misconception-never-fires. `prepared` is made from
 * withoutInvalidPatterns().
 */
export function misconceptionMatchingFindings(
  reaction: LintedReaction,
  prepared: PreparedReaction,
): LintFinding[] {
  return [...reaction.stateIdToState.keys()].flatMap((stateId) => {
    const positions = positionsOfParsablePatterns(reaction, stateId);
    return [
      ...hiddenCorrectAnswerFindings(prepared, stateId, positions),
      ...neverFiringFindings(prepared, stateId, positions),
    ];
  });
}
