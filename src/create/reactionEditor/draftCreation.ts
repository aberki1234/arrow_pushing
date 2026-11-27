/**
 * Create's Start stage (docs/SPEC.md §5, "Create"): a new draft from the reaction's name (its slug
 * made from it, reactionEditing/reactionSlugs.ts), the starting materials pasted as SMILES
 * (reactionEditing/startState.ts), optional conditions and the signed-in author; and the live
 * drawing of the SMILES typed so far.
 */
import type { ChemistryToolkit } from "../../tooling/chemistryToolkit/chemistryToolkit.js";
import { newReactionDraft, type ReactionDocument } from "../reactionEditing/reactionDraft.js";
import { slugFromTitle } from "../reactionEditing/reactionSlugs.js";
import { draftDrawing } from "./editorView.js";
import { StructureEntryError, stateFromPastedSmiles } from "../reactionEditing/startState.js";
import type { StateDrawing } from "../../drawing/moleculeDrawing/stateDrawing.js";

export type DraftCreation =
  | { readonly outcome: "created"; readonly document: ReactionDocument }
  | { readonly outcome: "refused"; readonly reason: string };

export interface DraftStart {
  /** The reaction's name; its slug is made from it (reactionEditing/reactionSlugs.ts). */
  readonly title: string;
  readonly pastedSmiles: string;
  readonly conditionsLabel: string;
  /** The signed-in author's name (the server's), or absent with make editor. */
  readonly authorName?: string | undefined;
}

type StructureReading = Pick<ChemistryToolkit, "readStructure" | "laidOutAtoms">;

function refusedFor(error: unknown): DraftCreation {
  if (error instanceof StructureEntryError) {
    return { outcome: "refused", reason: error.message };
  }
  throw error;
}

export function createdDraft(
  fields: DraftStart,
  takenSlugs: Iterable<string>,
  toolkit: StructureReading,
): DraftCreation {
  const title = fields.title.trim();
  if (title === "") {
    return { outcome: "refused", reason: "The reaction needs a name." };
  }
  try {
    const startState = stateFromPastedSmiles(fields.pastedSmiles, toolkit);
    const reactionSlug = slugFromTitle(title, takenSlugs);
    const authorName = fields.authorName?.trim() ?? "";
    const document = {
      ...newReactionDraft({ reactionSlug, title, startState }),
      conditionsLabel: fields.conditionsLabel.trim(),
      authors: authorName === "" ? [] : [{ name: authorName, url: null }],
    };
    return { outcome: "created", document };
  } catch (error) {
    return refusedFor(error);
  }
}

export type SmilesPreview =
  | { readonly outcome: "empty" }
  | { readonly outcome: "drawn"; readonly drawing: StateDrawing }
  | { readonly outcome: "refused"; readonly reason: string };

/** The Start stage's live drawing of the molecules typed so far. */
export function previewOfPastedSmiles(
  pastedSmiles: string,
  toolkit: StructureReading,
): SmilesPreview {
  if (pastedSmiles.trim() === "") {
    return { outcome: "empty" };
  }
  const creation = createdDraft(
    { title: "Preview", pastedSmiles, conditionsLabel: "" },
    [],
    toolkit,
  );
  if (creation.outcome === "refused") {
    return creation;
  }
  const { drawing } = draftDrawing(creation.document, String(creation.document.startStateId));
  return { outcome: "drawn", drawing };
}
