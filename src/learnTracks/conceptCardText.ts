/**
 * A concept card's text (docs/schema-design.md §6.1) read into blocks the page draws itself, so
 * no author text is ever inserted as HTML.
 *
 * The Markdown subset
 *   Blocks are separated by blank lines. A block whose lines all start with "- " is a list, one
 *   item per line; any other block is a paragraph (its line breaks become spaces).
 *   Inside text, **bold** and *italic*; an unmatched marker stays as written.
 *
 * Example
 *   "An **electrophile** adds.\n\n- loses H⁺\n- *aromatic* again"
 *   -> paragraph [An ][electrophile, bold][ adds.]
 *      list [[loses H⁺], [aromatic, italic][ again]]
 */

export interface TextRun {
  readonly text: string;
  readonly bold: boolean;
  readonly italic: boolean;
}

export type ConceptCardBlock =
  | { readonly blockKind: "paragraph"; readonly textRuns: readonly TextRun[] }
  | { readonly blockKind: "list"; readonly listItems: readonly (readonly TextRun[])[] };

const LIST_ITEM_MARKER = "- ";
// **bold** or *italic*: the shortest run between a pair of markers, not starting or ending in a
// space (so "2 * 3" is no italic).
const EMPHASIS_PATTERN = /\*\*(\S(?:.*?\S)?)\*\*|\*(\S(?:.*?\S)?)\*/g;

function plainRun(text: string): TextRun {
  return { text, bold: false, italic: false };
}

/** The text split into plain, bold and italic runs. */
function textRunsOf(text: string): TextRun[] {
  const textRuns: TextRun[] = [];
  let plainStart = 0;
  for (const emphasisMatch of text.matchAll(EMPHASIS_PATTERN)) {
    if (emphasisMatch.index > plainStart) {
      textRuns.push(plainRun(text.slice(plainStart, emphasisMatch.index)));
    }
    const [wholeMatch, boldText, italicText] = emphasisMatch;
    textRuns.push(
      boldText === undefined
        ? { text: italicText ?? "", bold: false, italic: true }
        : { text: boldText, bold: true, italic: false },
    );
    plainStart = emphasisMatch.index + wholeMatch.length;
  }
  if (plainStart < text.length) {
    textRuns.push(plainRun(text.slice(plainStart)));
  }
  return textRuns;
}

/** The blocks of a concept card's text. */
export function conceptCardBlocks(conceptCard: string): ConceptCardBlock[] {
  return conceptCard
    .split(/\n\s*\n/)
    .map((blockText) =>
      blockText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== ""),
    )
    .filter((lines) => lines.length > 0)
    .map((lines): ConceptCardBlock =>
      lines.every((line) => line.startsWith(LIST_ITEM_MARKER))
        ? {
            blockKind: "list",
            listItems: lines.map((line) => textRunsOf(line.slice(LIST_ITEM_MARKER.length))),
          }
        : { blockKind: "paragraph", textRuns: textRunsOf(lines.join(" ")) },
    );
}
