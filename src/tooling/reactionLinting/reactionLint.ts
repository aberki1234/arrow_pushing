/**
 * Lint one reaction file: every rule, in an order where each check can trust the ones before.
 *
 * Steps (a later group runs only when the earlier groups found no error that would break it)
 *   1. schema-violation (error): reactionFiles/schemaViolations, one finding per violation. Stop
 *      here if any: later checks assume the file's shape.
 *   2. state-atoms-inconsistent (error): reactionLinting/stateAtomConsistency (RDKit). Then
 *      mapped-smiles-not-supported (error): a state outside the strict SMILES subset
 *      (stateGraphs/mappedSmilesReading). Stop here if any: later checks read every state.
 *   3. Graph rules without chemistry (mechanismGraphRules), state ids first; stop if a step names
 *      an unknown state.
 *   4. Learner text (stateContentRules), misconception text (misconceptionRules) and abbreviated
 *      groups (abbreviatedGroupRules).
 *   5. Chemistry, on the reaction prepared for assessment without any misconception whose pattern
 *      does not parse: steps reproduce their to-states and leaving steps reach different states
 *      (stepReproduction), misconception matching (misconceptionRules), the symmetry cap.
 *
 * The rule ids and levels are listed in docs/schema-design.md §3.5. The same lint runs in the Node
 * command line (commandLine.ts) and, from item 8b, in the editor.
 */
import type { ChemistryToolkit } from "../chemistryToolkit/chemistryToolkit.js";
import { prepareReaction } from "../../core/attemptAssessment/preparedReaction.js";
import { MAXIMUM_SKELETON_SYMMETRIES } from "../../core/attemptAssessment/skeletonSymmetry.js";
import { schemaViolations } from "../../core/reactionFiles/schemaViolations.js";
import { stateAtomProblems } from "./stateAtomConsistency.js";
import {
  MappedSmilesError,
  stateGraphFromMappedSmiles,
} from "../../core/stateGraphs/mappedSmilesReading.js";
import {
  abbreviatedGroupArrowFindings,
  abbreviatedGroupStructureFindings,
} from "./abbreviatedGroupRules.js";
import { type LintedReaction, readLintedReaction } from "./lintedReaction.js";
import { type LintFinding, lintError } from "./lintFindings.js";
import { mechanismGraphFindings, unknownStateIdFindings } from "./mechanismGraphRules.js";
import {
  misconceptionMatchingFindings,
  misconceptionTextFindings,
  withoutInvalidPatterns,
} from "./misconceptionRules.js";
import { learnerTextFindings, symmetryCapFindings } from "./stateContentRules.js";
import { equivalentLeavingStepFindings, stepReproductionFindings } from "./stepReproduction.js";

type DocumentRecord = Readonly<Record<string, unknown>>;

function schemaFindings(reactionDocument: DocumentRecord): LintFinding[] {
  return schemaViolations(reactionDocument).map((violation) => ({
    lintRuleId: "schema-violation",
    lintLevel: "error",
    instancePath: violation.instancePath,
    message: violation.message,
  }));
}

/** Step 2. State atom problems are text lines "state <state id>: ..."; they point at the states. */
function stateReadingFindings(
  reactionDocument: DocumentRecord,
  reaction: LintedReaction,
  toolkit: Pick<ChemistryToolkit, "readAtoms">,
): LintFinding[] {
  const atomFindings = stateAtomProblems(reactionDocument, toolkit).map((problem) =>
    lintError("state-atoms-inconsistent", ["stateIdToState"], problem),
  );
  if (atomFindings.length > 0) {
    return atomFindings;
  }
  return [...reaction.stateIdToState].flatMap(([stateId, state]) => {
    try {
      stateGraphFromMappedSmiles(state.mappedSmiles);
      return [];
    } catch (error) {
      if (!(error instanceof MappedSmilesError)) {
        throw error;
      }
      return [
        lintError(
          "mapped-smiles-not-supported",
          ["stateIdToState", stateId, "mappedSmiles"],
          `${error.errorCode}: ${error.message}`,
        ),
      ];
    }
  });
}

/** Every lint finding for the document, in the order of the steps above; empty if clean. */
export function lintReaction(
  reactionDocument: DocumentRecord,
  toolkit: Pick<ChemistryToolkit, "readAtoms">,
  maximumSymmetries: number = MAXIMUM_SKELETON_SYMMETRIES,
): LintFinding[] {
  const shapeFindings = schemaFindings(reactionDocument);
  if (shapeFindings.length > 0) {
    return shapeFindings;
  }
  const reaction = readLintedReaction(reactionDocument);
  for (const blockingFindings of [
    (): LintFinding[] => stateReadingFindings(reactionDocument, reaction, toolkit),
    (): LintFinding[] => unknownStateIdFindings(reaction),
  ]) {
    const findings = blockingFindings();
    if (findings.length > 0) {
      return findings;
    }
  }
  const prepared = prepareReaction(withoutInvalidPatterns(reactionDocument, reaction));
  return [
    ...mechanismGraphFindings(reaction),
    ...learnerTextFindings(reaction),
    ...misconceptionTextFindings(reaction),
    ...abbreviatedGroupStructureFindings(reaction),
    ...abbreviatedGroupArrowFindings(reaction),
    ...stepReproductionFindings(reaction, prepared),
    ...equivalentLeavingStepFindings(reaction, prepared),
    ...misconceptionMatchingFindings(reaction, prepared),
    ...symmetryCapFindings(reaction, prepared, maximumSymmetries),
  ];
}
