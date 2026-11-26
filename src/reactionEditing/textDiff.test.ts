/** Tests for textDiff.ts: word-level deletions and insertions between two texts. */
import { describe, expect, it } from "vitest";
import { textDiff } from "./textDiff.js";

describe("a word-level text diff", () => {
  it("marks the words deleted and inserted, keeping the rest", () => {
    expect(
      textDiff("The C–Br carbon is δ+.", "Carbon is bonded to bromine, which pulls: carbon is δ+."),
    ).toEqual([
      { pieceKind: "deleted", text: "The C–Br " },
      { pieceKind: "inserted", text: "Carbon is bonded to bromine, which pulls: " },
      { pieceKind: "same", text: "carbon is δ+." },
    ]);
  });

  it("keeps an unchanged text whole, and an empty side as all inserted or deleted", () => {
    expect(textDiff("same words", "same words")).toEqual([
      { pieceKind: "same", text: "same words" },
    ]);
    expect(textDiff("", "new text")).toEqual([{ pieceKind: "inserted", text: "new text" }]);
    expect(textDiff("old text", "")).toEqual([{ pieceKind: "deleted", text: "old text" }]);
    expect(textDiff("", "")).toEqual([]);
  });

  it("inserts a word in the middle", () => {
    expect(textDiff("attacks from the back", "attacks the carbon from the back")).toEqual([
      { pieceKind: "same", text: "attacks " },
      { pieceKind: "inserted", text: "the carbon " },
      { pieceKind: "same", text: "from the back" },
    ]);
  });

  it("falls back to the whole text deleted and inserted when both are very long", () => {
    const longText = "word ".repeat(3000);
    expect(textDiff(longText, `${longText}more`)).toEqual([
      { pieceKind: "deleted", text: longText },
      { pieceKind: "inserted", text: `${longText}more` },
    ]);
  });
});
