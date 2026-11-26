/**
 * A word-level diff of two texts, for the review screen (docs/SPEC.md §6, "Contributors": text is
 * shown with its deletions and insertions).
 *
 * The texts are split into words and the spaces between them; the longest common subsequence of
 * those tokens is kept ("same") and the rest is deleted or inserted. A deletion is listed before
 * the insertion that replaces it, spaces alone between two changes belong to the change (so a
 * replaced phrase reads as one), and pieces of one kind next to each other are joined. Learner
 * texts are short; past MAXIMUM_TOKEN_PRODUCT the whole old text is deleted and the new inserted.
 */

export type TextPieceKind = "same" | "deleted" | "inserted";

export interface TextPiece {
  readonly pieceKind: TextPieceKind;
  readonly text: string;
}

/** The largest (old tokens × new tokens) table computed: about 4 million cells. */
const MAXIMUM_TOKEN_PRODUCT = 4_000_000;

function tokensOf(text: string): string[] {
  return text.split(/(\s+)/).filter((token) => token !== "");
}

/** lengths[i][j]: the longest common subsequence of oldTokens[i..] and newTokens[j..]. */
function commonLengths(oldTokens: readonly string[], newTokens: readonly string[]): number[][] {
  const lengths = Array.from({ length: oldTokens.length + 1 }, () =>
    new Array<number>(newTokens.length + 1).fill(0),
  );
  for (let i = oldTokens.length - 1; i >= 0; i -= 1) {
    const row = lengths[i] ?? [];
    const below = lengths[i + 1] ?? [];
    for (let j = newTokens.length - 1; j >= 0; j -= 1) {
      row[j] =
        oldTokens[i] === newTokens[j]
          ? (below[j + 1] ?? 0) + 1
          : Math.max(below[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  return lengths;
}

function appendPiece(pieces: TextPiece[], pieceKind: TextPieceKind, text: string): void {
  const last = pieces[pieces.length - 1];
  if (last?.pieceKind === pieceKind) {
    pieces[pieces.length - 1] = { pieceKind, text: last.text + text };
  } else {
    pieces.push({ pieceKind, text });
  }
}

/** Put each run's deletion before its insertion, then join neighbours of one kind again. */
function orderedRuns(pieces: readonly TextPiece[]): TextPiece[] {
  const ordered: TextPiece[] = [];
  let deleted = "";
  let inserted = "";
  const flush = (): void => {
    if (deleted !== "") appendPiece(ordered, "deleted", deleted);
    if (inserted !== "") appendPiece(ordered, "inserted", inserted);
    deleted = "";
    inserted = "";
  };
  pieces.forEach((piece, position) => {
    const isSpaceBetweenChanges =
      piece.pieceKind === "same" &&
      piece.text.trim() === "" &&
      (deleted !== "" || inserted !== "") &&
      pieces[position + 1] !== undefined;
    if (isSpaceBetweenChanges) {
      deleted += piece.text;
      inserted += piece.text;
    } else if (piece.pieceKind === "same") {
      flush();
      appendPiece(ordered, "same", piece.text);
    } else if (piece.pieceKind === "deleted") {
      deleted += piece.text;
    } else {
      inserted += piece.text;
    }
  });
  flush();
  return ordered;
}

/** Whether the tokens at (i, j) are kept, the old one deleted, or the new one inserted. */
function nextPieceKind(
  oldToken: string | undefined,
  newToken: string | undefined,
  lengths: readonly (readonly number[])[],
  [i, j]: readonly [number, number],
): TextPieceKind {
  if (oldToken !== undefined && oldToken === newToken) {
    return "same";
  }
  if (newToken === undefined) {
    return "deleted";
  }
  const keepsMoreByDeleting = (lengths[i + 1]?.[j] ?? 0) >= (lengths[i]?.[j + 1] ?? 0);
  return oldToken !== undefined && keepsMoreByDeleting ? "deleted" : "inserted";
}

/** The pieces that turn `oldText` into `newText`. */
export function textDiff(oldText: string, newText: string): TextPiece[] {
  const oldTokens = tokensOf(oldText);
  const newTokens = tokensOf(newText);
  if (oldTokens.length * newTokens.length > MAXIMUM_TOKEN_PRODUCT) {
    return orderedRuns([
      { pieceKind: "deleted", text: oldText },
      { pieceKind: "inserted", text: newText },
    ]);
  }
  const lengths = commonLengths(oldTokens, newTokens);
  const pieces: TextPiece[] = [];
  let i = 0;
  let j = 0;
  while (i < oldTokens.length || j < newTokens.length) {
    const pieceKind = nextPieceKind(oldTokens[i], newTokens[j], lengths, [i, j]);
    appendPiece(pieces, pieceKind, (pieceKind === "inserted" ? newTokens[j] : oldTokens[i]) ?? "");
    i += pieceKind === "inserted" ? 0 : 1;
    j += pieceKind === "deleted" ? 0 : 1;
  }
  return orderedRuns(pieces);
}
