/** Tests for conceptCardText.ts: the Markdown subset of docs/schema-design.md §6.1. */
import { expect, it } from "vitest";
import { conceptCardBlocks, type TextRun } from "./conceptCardText.js";

function plain(text: string): TextRun {
  return { text, bold: false, italic: false };
}

it("blank lines separate paragraphs; a paragraph's line breaks become spaces", () => {
  expect(conceptCardBlocks("First line\nsame paragraph.\n\nSecond.")).toEqual([
    { blockKind: "paragraph", textRuns: [plain("First line same paragraph.")] },
    { blockKind: "paragraph", textRuns: [plain("Second.")] },
  ]);
});

it("bold and italic runs", () => {
  expect(conceptCardBlocks("An **electrophile** adds, *then* H⁺ leaves.")).toEqual([
    {
      blockKind: "paragraph",
      textRuns: [
        plain("An "),
        { text: "electrophile", bold: true, italic: false },
        plain(" adds, "),
        { text: "then", bold: false, italic: true },
        plain(" H⁺ leaves."),
      ],
    },
  ]);
});

it("a block of '- ' lines is a list", () => {
  expect(conceptCardBlocks("- loses H⁺\n- *aromatic* again")).toEqual([
    {
      blockKind: "list",
      listItems: [
        [plain("loses H⁺")],
        [{ text: "aromatic", bold: false, italic: true }, plain(" again")],
      ],
    },
  ]);
});

it("an unmatched marker stays as written", () => {
  expect(conceptCardBlocks("2 * 3 and **open")).toEqual([
    { blockKind: "paragraph", textRuns: [plain("2 * 3 and **open")] },
  ]);
});

it("HTML stays text", () => {
  expect(conceptCardBlocks("<script>alert(1)</script>")).toEqual([
    { blockKind: "paragraph", textRuns: [plain("<script>alert(1)</script>")] },
  ]);
});

it("extra blank lines and surrounding space make no empty blocks", () => {
  expect(conceptCardBlocks("\n\n  One.  \n\n\n\nTwo.\n")).toEqual([
    { blockKind: "paragraph", textRuns: [plain("One.")] },
    { blockKind: "paragraph", textRuns: [plain("Two.")] },
  ]);
});
