/**
 * The slug of a new reaction, made from the name typed on Create's Start stage (docs/SPEC.md §5,
 * "Create"): lower-case letters and digits, words joined by "-" (docs/schema-design.md §1), and
 * not one of the slugs already taken (then "-2", "-3", …).
 *
 * Accents are dropped (é → e) and subscripts become digits (₂ → 2); the Greek letters common in
 * reaction names are spelled out (α → alpha). A name with nothing left gives "reaction".
 */

const GREEK_LETTER_TO_NAME: Readonly<Record<string, string>> = {
  α: "alpha",
  β: "beta",
  γ: "gamma",
  δ: "delta",
  ε: "epsilon",
  σ: "sigma",
  π: "pi",
  ω: "omega",
};

const SLUG_WHEN_EMPTY = "reaction";

function plainSlug(title: string): string {
  const spelledOut = title
    .toLowerCase()
    .replace(/[αβγδεσπω]/gu, (letter) => ` ${GREEK_LETTER_TO_NAME[letter] ?? letter} `);
  const words = spelledOut
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== "");
  return words.length === 0 ? SLUG_WHEN_EMPTY : words.join("-");
}

export function slugFromTitle(title: string, takenSlugs: Iterable<string>): string {
  const taken = new Set(takenSlugs);
  const slug = plainSlug(title);
  if (!taken.has(slug)) {
    return slug;
  }
  let number = 2;
  while (taken.has(`${slug}-${String(number)}`)) {
    number += 1;
  }
  return `${slug}-${String(number)}`;
}
