/**
 * "New reaction" on the editor's start panel: a slug (docs/schema-design.md §1: lower-case words
 * joined by "-"), a title, and the start structure pasted as SMILES
 * (reactionEditing/startState.ts).
 */
import type { ChemistryToolkit } from "../chemistryToolkit/chemistryToolkit.js";
import { newReactionDraft, type ReactionDocument } from "../reactionEditing/reactionDraft.js";
import { StructureEntryError, stateFromPastedSmiles } from "../reactionEditing/startState.js";

export type DraftCreation =
  | { readonly outcome: "created"; readonly document: ReactionDocument }
  | { readonly outcome: "refused"; readonly reason: string };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function createdDraft(
  fields: { readonly reactionSlug: string; readonly title: string; readonly pastedSmiles: string },
  toolkit: Pick<ChemistryToolkit, "readStructure" | "laidOutAtoms">,
): DraftCreation {
  if (!SLUG_PATTERN.test(fields.reactionSlug)) {
    return {
      outcome: "refused",
      reason: "The slug is lower-case letters and digits, words joined by -.",
    };
  }
  const title = fields.title.trim();
  if (title === "") {
    return { outcome: "refused", reason: "The reaction needs a title." };
  }
  try {
    const startState = stateFromPastedSmiles(fields.pastedSmiles, toolkit);
    return {
      outcome: "created",
      document: newReactionDraft({ reactionSlug: fields.reactionSlug, title, startState }),
    };
  } catch (error) {
    if (error instanceof StructureEntryError) {
      return { outcome: "refused", reason: error.message };
    }
    throw error;
  }
}
