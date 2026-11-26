/**
 * Text in the reaction cards' drawings (SPEC §5 "Drawing in the cards"): labels and conditions
 * as runs written normal, as a subscript or as a superscript, their widths in Arial at the
 * label font, and the conditions split above and below the arrow.
 *
 * Terms
 *   text run  A piece of text written normal, as a subscript or as a superscript.
 */

/** About 0.68 bond lengths (SCHEME_BOND_LENGTH), as the RSC / ACS document style. */
export const SCHEME_FONT_SIZE = 13.6;
/** Sub- and superscripts are written this size, in em of the label's font. */
export const SCRIPT_SIZE = 0.7;

export type TextRunPosition = "normal" | "subscript" | "superscript";

export interface TextRun {
  readonly text: string;
  readonly position: TextRunPosition;
}

const RUN_POSITION_TO_RISE: Readonly<Record<TextRunPosition, number>> = {
  normal: 0,
  subscript: 0.2,
  superscript: -0.4,
};

const SUBSCRIPT_TO_PLAIN: Readonly<Record<string, string>> = Object.fromEntries(
  Array.from("₀₁₂₃₄₅₆₇₈₉₊₋").map((character, position) => [
    character,
    "0123456789+−"[position] ?? "",
  ]),
);
const SUPERSCRIPT_TO_PLAIN: Readonly<Record<string, string>> = Object.fromEntries(
  Array.from("⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻").map((character, position) => [
    character,
    "0123456789+−"[position] ?? "",
  ]),
);

/** The text as runs: Unicode sub- and superscript characters become plain ones in their runs. */
export function textRuns(text: string): TextRun[] {
  const runs: { text: string; position: TextRunPosition }[] = [];
  for (const character of text) {
    let position: TextRunPosition = "normal";
    let plain = character;
    if (Object.hasOwn(SUBSCRIPT_TO_PLAIN, character)) {
      position = "subscript";
      plain = SUBSCRIPT_TO_PLAIN[character] ?? character;
    } else if (Object.hasOwn(SUPERSCRIPT_TO_PLAIN, character)) {
      position = "superscript";
      plain = SUPERSCRIPT_TO_PLAIN[character] ?? character;
    }
    const last = runs.at(-1);
    if (last?.position === position) {
      last.text += plain;
    } else {
      runs.push({ text: plain, position });
    }
  }
  return runs;
}

/** Each run's vertical shift from the run before it, in em of the label's font (SVG dy). */
export function textRunShifts(runs: readonly TextRun[]): number[] {
  let rise = 0;
  return runs.map(({ position }) => {
    const shift = RUN_POSITION_TO_RISE[position] - rise;
    rise = RUN_POSITION_TO_RISE[position];
    return shift;
  });
}

/** The conditions over the arrow (up to the first "·") and under it (the rest, comma-joined). */
export function conditionsLabelParts(conditionsLabel: string | undefined): {
  above: string;
  below: string;
} {
  const [above = "", ...below] = (conditionsLabel ?? "")
    .split("·")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  return { above, below: below.join(", ") };
}

// Arial advance widths in em, for the letters labels use; others fall back by case.
const CHARACTER_TO_WIDTH: Readonly<Record<string, number>> = {
  B: 0.667,
  C: 0.722,
  F: 0.611,
  H: 0.722,
  I: 0.278,
  K: 0.667,
  L: 0.556,
  M: 0.833,
  N: 0.722,
  O: 0.778,
  P: 0.667,
  S: 0.667,
  T: 0.611,
  i: 0.222,
  l: 0.222,
  r: 0.333,
  t: 0.278,
  f: 0.278,
};

function characterWidth(character: string): number {
  if (Object.hasOwn(CHARACTER_TO_WIDTH, character)) {
    return CHARACTER_TO_WIDTH[character] ?? 0;
  }
  return /[A-Z]/.test(character) ? 0.72 : 0.556;
}

/** How wide the runs are written, in pixels. */
export function runsWidth(runs: readonly TextRun[]): number {
  return runs.reduce((width, run) => {
    const size = run.position === "normal" ? SCHEME_FONT_SIZE : SCRIPT_SIZE * SCHEME_FONT_SIZE;
    return (
      width +
      Array.from(run.text).reduce((sum, character) => sum + characterWidth(character), 0) * size
    );
  }, 0);
}
