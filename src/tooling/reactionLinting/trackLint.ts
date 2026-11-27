/**
 * The track linter: the rules a track file (schema/track.schema.json) must keep.
 *
 * Rules (docs/schema-design.md §6.1), in order
 *   schema-violation                 (error)   the file breaks the track schema; nothing else
 *                                              is checked then.
 *   problem-set-slug-repeated        (error)   two problem sets of the track share a slug.
 *   set-item-reaction-repeated       (error)   a reaction appears twice in one problem set.
 *   set-item-not-published           (warning) a set item's reaction is not published; the
 *                                              catalogue build leaves it out.
 *   checkpoint-not-last              (error)   a checkpoint problem set is not the last one.
 *   checkpoint-reaction-not-earlier  (error)   a checkpoint's reaction is in no earlier problem
 *                                              set of the track.
 *   curriculum-code-wrong-level      (error)   the curriculum code's letter is not the level's
 *                                              (F foundations, C core, A advanced, G graduate).
 *   showcase-not-in-track            (error)   the showcase reaction is no set item of the track.
 */
import {
  CURRICULUM_LEVEL_TO_LETTER,
  type TrackDocument,
  trackSchemaViolations,
} from "../../core/trackFiles/trackSchemaViolations.js";
import { type LintFinding, lintError, lintWarning } from "./lintFindings.js";

function schemaFindings(trackDocument: unknown): LintFinding[] {
  return trackSchemaViolations(trackDocument).map((violation) => ({
    lintRuleId: "schema-violation",
    lintLevel: "error",
    instancePath: violation.instancePath,
    message: violation.message,
  }));
}

function repeatedProblemSetSlugFindings(track: TrackDocument): LintFinding[] {
  const seenSlugs = new Set<string>();
  const findings: LintFinding[] = [];
  track.problemSets.forEach((problemSet, problemSetPosition) => {
    if (seenSlugs.has(problemSet.problemSetSlug)) {
      findings.push(
        lintError(
          "problem-set-slug-repeated",
          ["problemSets", problemSetPosition, "problemSetSlug"],
          `another problem set of the track is already called ${problemSet.problemSetSlug}`,
        ),
      );
    }
    seenSlugs.add(problemSet.problemSetSlug);
  });
  return findings;
}

/** Repeated and unpublished reactions, set item by set item. */
function setItemFindings(
  track: TrackDocument,
  publishedReactionSlugs: ReadonlySet<string>,
): LintFinding[] {
  const findings: LintFinding[] = [];
  track.problemSets.forEach((problemSet, problemSetPosition) => {
    const slugsInThisProblemSet = new Set<string>();
    problemSet.setItems.forEach((setItem, setItemPosition) => {
      const slug = setItem.reactionSlug;
      const pathParts = ["problemSets", problemSetPosition, "setItems", setItemPosition];
      if (slugsInThisProblemSet.has(slug)) {
        findings.push(
          lintError(
            "set-item-reaction-repeated",
            [...pathParts, "reactionSlug"],
            `${slug} is already in problem set ${problemSet.problemSetSlug}`,
          ),
        );
      }
      slugsInThisProblemSet.add(slug);
      if (!publishedReactionSlugs.has(slug)) {
        findings.push(
          lintWarning(
            "set-item-not-published",
            [...pathParts, "reactionSlug"],
            `${slug} is not published; the catalogue build leaves this set item out`,
          ),
        );
      }
    });
  });
  return findings;
}

/** A checkpoint must come last and reuse reactions of the problem sets before it. */
function checkpointFindings(track: TrackDocument): LintFinding[] {
  const findings: LintFinding[] = [];
  const slugsOfEarlierProblemSets = new Set<string>();
  const lastPosition = track.problemSets.length - 1;
  track.problemSets.forEach((problemSet, problemSetPosition) => {
    if (problemSet.checkpoint && problemSetPosition !== lastPosition) {
      findings.push(
        lintError(
          "checkpoint-not-last",
          ["problemSets", problemSetPosition, "checkpoint"],
          `checkpoint ${problemSet.problemSetSlug} must be the last problem set of the track`,
        ),
      );
    }
    problemSet.setItems.forEach((setItem, setItemPosition) => {
      if (problemSet.checkpoint && !slugsOfEarlierProblemSets.has(setItem.reactionSlug)) {
        findings.push(
          lintError(
            "checkpoint-reaction-not-earlier",
            ["problemSets", problemSetPosition, "setItems", setItemPosition, "reactionSlug"],
            `${setItem.reactionSlug} is in no earlier problem set; a checkpoint only reviews ` +
              "reactions the track has already taught",
          ),
        );
      }
    });
    for (const setItem of problemSet.setItems) {
      slugsOfEarlierProblemSets.add(setItem.reactionSlug);
    }
  });
  return findings;
}

/** The code's letter matches the level, and the showcase is one of the track's reactions. */
function curriculumFindings(track: TrackDocument): LintFinding[] {
  const findings: LintFinding[] = [];
  const levelLetter = CURRICULUM_LEVEL_TO_LETTER[track.level];
  if (!track.curriculumCode.startsWith(levelLetter)) {
    findings.push(
      lintError(
        "curriculum-code-wrong-level",
        ["curriculumCode"],
        `${track.curriculumCode} does not start with ${levelLetter}, the letter of the ` +
          `${track.level} level`,
      ),
    );
  }
  const trackReactionSlugs = track.problemSets.flatMap((problemSet) =>
    problemSet.setItems.map((setItem) => setItem.reactionSlug),
  );
  if (!trackReactionSlugs.includes(track.showcaseReactionSlug)) {
    findings.push(
      lintError(
        "showcase-not-in-track",
        ["showcaseReactionSlug"],
        `${track.showcaseReactionSlug} is no set item of the track; the showcase shows one of ` +
          "the reactions the track teaches",
      ),
    );
  }
  return findings;
}

/**
 * The lint findings of one track document.
 * `publishedReactionSlugs`: the slugs that have at least one published version.
 */
export function lintTrack(
  trackDocument: unknown,
  publishedReactionSlugs: ReadonlySet<string>,
): LintFinding[] {
  const shapeFindings = schemaFindings(trackDocument);
  if (shapeFindings.length > 0) {
    return shapeFindings;
  }
  const track = trackDocument as TrackDocument; // valid against the track schema just above
  return [
    ...repeatedProblemSetSlugFindings(track),
    ...setItemFindings(track, publishedReactionSlugs),
    ...checkpointFindings(track),
    ...curriculumFindings(track),
  ];
}
