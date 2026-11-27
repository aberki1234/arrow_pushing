/**
 * List fields edited as lines of text in the editor's panels, one entry per line; blank lines are
 * skipped. Each read gives the value or why the text cannot be read; each write gives text that
 * reads back to the same value.
 *
 *   map numbers          "4, 7" (commas or spaces)
 *   authors              "A. Chemist | https://example.org" (the link is optional)
 *   roles                "nucleophile: 1, 2"
 *   annotations          "nucleophile @ 1"
 *   abbreviated groups   "Ph @ 11: 11, 12, 13, 14, 15, 16" (label @ attachment: every atom)
 */
export type ReadText<Value> = { readonly value: Value } | { readonly reason: string };

interface Author {
  readonly name: string;
  readonly url: string | null;
}

interface Annotation {
  readonly text: string;
  readonly nearMapNumber: number;
}

interface AbbreviatedGroup {
  readonly groupLabel: string;
  readonly attachmentMapNumber: number;
  readonly mapNumbers: readonly number[];
}

function linesOf(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** Read every line with `readLine`; the first line it refuses refuses the whole text. */
function readLines<Value>(
  text: string,
  readLine: (line: string) => Value | undefined,
  format: string,
): ReadText<Value[]> {
  const values: Value[] = [];
  for (const line of linesOf(text)) {
    const value = readLine(line);
    if (value === undefined) {
      return { reason: `write "${format}": ${line}` };
    }
    values.push(value);
  }
  return { value: values };
}

export function readMapNumbers(text: string): ReadText<number[]> {
  const parts = text.split(/[\s,]+/).filter((part) => part !== "");
  const bad = parts.find((part) => !/^[1-9][0-9]*$/.test(part));
  return bad === undefined
    ? { value: parts.map(Number) }
    : { reason: `"${bad}" is not a map number` };
}

export function mapNumbersText(numbers: readonly number[]): string {
  return numbers.join(", ");
}

export function readAuthors(text: string): ReadText<Author[]> {
  return readLines(
    text,
    (line) => {
      const [name = "", url = ""] = line.split("|").map((part) => part.trim());
      return name === "" ? undefined : { name, url: url === "" ? null : url };
    },
    "name | link",
  );
}

export function authorsText(authors: readonly Author[]): string {
  return authors
    .map((author) => (author.url === null ? author.name : `${author.name} | ${author.url}`))
    .join("\n");
}

/** "<words> <separator> <map numbers>" split at the first separator, or undefined. */
function splitAt(line: string, separator: string): [string, number[]] | undefined {
  const at = line.indexOf(separator);
  if (at < 0) {
    return undefined;
  }
  const numbers = readMapNumbers(line.slice(at + separator.length));
  const before = line.slice(0, at).trim();
  return "value" in numbers && numbers.value.length > 0 && before !== ""
    ? [before, numbers.value]
    : undefined;
}

export function readRoles(text: string): ReadText<Record<string, number[]>> {
  const pairs = readLines(text, (line) => splitAt(line, ":"), "role: map numbers");
  return "reason" in pairs ? pairs : { value: Object.fromEntries(pairs.value) };
}

export function rolesText(roles: Readonly<Record<string, readonly number[]>>): string {
  return Object.entries(roles)
    .map(([role, mapNumbers]) => `${role}: ${mapNumbersText(mapNumbers)}`)
    .join("\n");
}

export function readAnnotations(text: string): ReadText<Annotation[]> {
  return readLines(
    text,
    (line) => {
      const pair = splitAt(line, "@");
      return pair === undefined || pair[1].length !== 1
        ? undefined
        : { text: pair[0], nearMapNumber: pair[1][0] ?? 0 };
    },
    "text @ map number",
  );
}

export function annotationsText(annotations: readonly Annotation[]): string {
  return annotations
    .map((annotation) => `${annotation.text} @ ${String(annotation.nearMapNumber)}`)
    .join("\n");
}

export function readAbbreviatedGroups(text: string): ReadText<AbbreviatedGroup[]> {
  return readLines(
    text,
    (line) => {
      const [label = "", rest = ""] = line.split("@").map((part) => part.trim());
      const pair = splitAt(rest, ":");
      return label === "" || pair === undefined || !/^[1-9][0-9]*$/.test(pair[0])
        ? undefined
        : { groupLabel: label, attachmentMapNumber: Number(pair[0]), mapNumbers: pair[1] };
    },
    "label @ attachment: map numbers",
  );
}

export function abbreviatedGroupsText(groups: readonly AbbreviatedGroup[]): string {
  return groups
    .map((group) => {
      const label = `${group.groupLabel} @ ${String(group.attachmentMapNumber)}`;
      return `${label}: ${mapNumbersText(group.mapNumbers)}`;
    })
    .join("\n");
}
