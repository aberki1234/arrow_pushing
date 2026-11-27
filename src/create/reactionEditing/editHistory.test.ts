/** Tests for editHistory.ts: undo and redo over whole-document snapshots. */
import { describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  MAXIMUM_UNDO_LEVELS,
  recordEdit,
  redo,
  startHistory,
  undo,
} from "./editHistory.js";

const first = { title: "first" };
const second = { title: "second" };
const third = { title: "third" };

describe("edit history", () => {
  it("starts with nothing to undo or redo", () => {
    const history = startHistory(first);
    expect(history.present).toBe(first);
    expect(canUndo(history) || canRedo(history)).toBe(false);
  });

  it("undoes and redoes edits in order", () => {
    const history = recordEdit(recordEdit(startHistory(first), second), third);
    const undoneTwice = undo(undo(history));
    expect(undoneTwice.present).toBe(first);
    expect(canUndo(undoneTwice)).toBe(false);
    expect(redo(undoneTwice).present).toBe(second);
    expect(redo(redo(undoneTwice)).present).toBe(third);
  });

  it("clears what could be redone when a new edit is made", () => {
    const history = recordEdit(undo(recordEdit(startHistory(first), second)), third);
    expect(history.present).toBe(third);
    expect(canRedo(history)).toBe(false);
    expect(undo(history).present).toBe(first);
  });

  it("ignores recording the document it already holds, and undo or redo with nothing to do", () => {
    const history = startHistory(first);
    expect(recordEdit(history, first)).toBe(history);
    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
  });

  it("keeps at most MAXIMUM_UNDO_LEVELS earlier documents", () => {
    let history = startHistory({ edit: 0 });
    for (let edit = 1; edit <= MAXIMUM_UNDO_LEVELS + 5; edit += 1) {
      history = recordEdit(history, { edit });
    }
    expect(history.past).toHaveLength(MAXIMUM_UNDO_LEVELS);
    expect(history.past[0]).toEqual({ edit: 5 });
  });
});
