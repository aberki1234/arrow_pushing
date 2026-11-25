/**
 * The linter's command line, run with `npx tsx src/reactionLinting/runFromShell.ts`.
 *
 * Commands
 *   lint FILE... [--json]
 *     Lint each reaction file. Prints one line per lint finding ("<file>: error <rule id> at
 *     <instance path>: <message>"), or with --json a list of lint reports
 *     ({reactionFile, lintFindings, errorCount, warningCount}).
 *     Exit status 1 if any file has an error or cannot be read as JSON; warnings alone give 0.
 *   seed-coordinates FILE...
 *     Fill in RDKit coordinates for each state whose coordinates do not cover exactly its atoms,
 *     and write the file back (2-space JSON) if anything changed. Prints the states seeded.
 *     Exit status 1 if a file cannot be read as JSON.
 * A malformed command prints the usage and exits with 2.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadChemistryToolkit } from "../chemistryToolkit/chemistryToolkit.js";
import { seedMissingCoordinates } from "./coordinateSeeding.js";
import type { LintFinding } from "./lintFindings.js";
import { lintReaction } from "./reactionLint.js";

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1; // an error-level finding, or a file that is not JSON
const EXIT_MALFORMED_COMMAND = 2;
const USAGE = [
  "usage: reaction-linting lint FILE... [--json]",
  "       reaction-linting seed-coordinates FILE...",
].join("\n");

type PrintLine = (line: string) => void;

interface LintReport {
  readonly reactionFile: string;
  readonly lintFindings: readonly LintFinding[];
  readonly errorCount: number;
  readonly warningCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The parsed file, or the reason it cannot be read. */
function readReactionFile(reactionPath: string): Record<string, unknown> | Error {
  try {
    const document: unknown = JSON.parse(readFileSync(reactionPath, "utf-8"));
    return isRecord(document) ? document : new Error("the file does not hold a JSON object");
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

async function lintReport(reactionPath: string): Promise<LintReport> {
  const document = readReactionFile(reactionPath);
  const lintFindings: LintFinding[] =
    document instanceof Error
      ? [
          {
            lintRuleId: "file-not-readable",
            lintLevel: "error",
            instancePath: "",
            message: document.message,
          },
        ]
      : lintReaction(document, await loadChemistryToolkit());
  const countOf = (level: string): number =>
    lintFindings.filter((finding) => finding.lintLevel === level).length;
  return {
    reactionFile: reactionPath,
    lintFindings,
    errorCount: countOf("error"),
    warningCount: countOf("warning"),
  };
}

async function runLint(
  reactionPaths: readonly string[],
  printJson: boolean,
  printLine: PrintLine,
): Promise<number> {
  const reports: LintReport[] = [];
  for (const reactionPath of reactionPaths) {
    reports.push(await lintReport(reactionPath));
  }
  if (printJson) {
    printLine(JSON.stringify(reports, null, 2));
  } else {
    for (const report of reports) {
      for (const finding of report.lintFindings) {
        printLine(
          `${report.reactionFile}: ${finding.lintLevel} ${finding.lintRuleId} at ` +
            `${finding.instancePath || "/"}: ${finding.message}`,
        );
      }
    }
  }
  return reports.some((report) => report.errorCount > 0) ? EXIT_FAILURE : EXIT_SUCCESS;
}

async function runSeedCoordinates(
  reactionPaths: readonly string[],
  printLine: PrintLine,
): Promise<number> {
  const toolkit = await loadChemistryToolkit();
  let exitStatus = EXIT_SUCCESS;
  for (const reactionPath of reactionPaths) {
    const document = readReactionFile(reactionPath);
    if (document instanceof Error) {
      printLine(`${reactionPath}: error file-not-readable: ${document.message}`);
      exitStatus = EXIT_FAILURE;
      continue;
    }
    const seededStateIds = seedMissingCoordinates(document, toolkit);
    if (seededStateIds.length > 0) {
      writeFileSync(reactionPath, `${JSON.stringify(document, null, 2)}\n`, "utf-8");
      printLine(`${reactionPath}: seeded ${seededStateIds.join(", ")}`);
    }
  }
  return exitStatus;
}

/** Run one command; returns the exit status. */
export async function runReactionLinting(
  argumentTexts: readonly string[],
  printLine: PrintLine,
): Promise<number> {
  const [command, ...rest] = argumentTexts;
  const options = rest.filter((text) => text.startsWith("--"));
  const reactionPaths = rest.filter((text) => !text.startsWith("--"));
  const knownOptions = command === "lint" ? ["--json"] : [];
  const wellFormed =
    (command === "lint" || command === "seed-coordinates") &&
    reactionPaths.length > 0 &&
    options.every((option) => knownOptions.includes(option));
  if (!wellFormed) {
    printLine(USAGE);
    return EXIT_MALFORMED_COMMAND;
  }
  return command === "lint"
    ? runLint(reactionPaths, options.includes("--json"), printLine)
    : runSeedCoordinates(reactionPaths, printLine);
}
