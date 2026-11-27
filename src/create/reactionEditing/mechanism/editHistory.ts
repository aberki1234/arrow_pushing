/**
 * Undo and redo over whole-document snapshots: every edit stores the document it replaced.
 * Documents are never changed in place (reactionDraft.ts), so a snapshot is a reference.
 */
import type { ReactionDocument } from "../draft/reactionDraft.js";

/** How many earlier documents are kept; older ones are dropped. */
export const MAXIMUM_UNDO_LEVELS = 200;

export interface EditHistory {
  /** Oldest first. */
  readonly past: readonly ReactionDocument[];
  readonly present: ReactionDocument;
  /** The next redo first. */
  readonly future: readonly ReactionDocument[];
}

export function startHistory(document: ReactionDocument): EditHistory {
  return { past: [], present: document, future: [] };
}

/** `document` becomes the present; what could be redone is dropped. */
export function recordEdit(history: EditHistory, document: ReactionDocument): EditHistory {
  if (document === history.present) {
    return history;
  }
  return {
    past: [...history.past, history.present].slice(-MAXIMUM_UNDO_LEVELS),
    present: document,
    future: [],
  };
}

export function canUndo(history: EditHistory): boolean {
  return history.past.length > 0;
}

export function canRedo(history: EditHistory): boolean {
  return history.future.length > 0;
}

export function undo(history: EditHistory): EditHistory {
  const previous = history.past.at(-1);
  if (previous === undefined) {
    return history;
  }
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo(history: EditHistory): EditHistory {
  const [next, ...rest] = history.future;
  if (next === undefined) {
    return history;
  }
  return { past: [...history.past, history.present], present: next, future: rest };
}
