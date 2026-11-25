/**
 * The catalogue build's command line, run with `npx tsx src/catalogueBuilding/runFromShell.ts`.
 *
 * Command
 *   build FILE... --out FOLDER (--previous-catalogue FILE | --start-new-calendar)
 *         [--build-date YYYY-MM-DD] [--built-at YYYY-MM-DDTHH:MM:SSZ]
 *     Read and lint the published reaction files, check them against the previous catalogue,
 *     extend the daily calendar and write catalogue.json plus r/<slug>/<version>.<hash>.json into
 *     FOLDER (new or empty). Lint warnings are printed. Exit status 1 with
 *     "error <error code>: <message>" if the build refuses; nothing is written then.
 *     --build-date and --built-at default to the current UTC date and time.
 * A malformed command prints the usage and exits with 2.
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { loadChemistryToolkit } from "../chemistryToolkit/chemistryToolkit.js";
import { assembleCatalogue } from "./catalogueAssembly.js";
import { CatalogueBuildError } from "./catalogueBuildErrors.js";
import {
  checkVersionNumbering,
  type PublishedVersion,
  readPublishedVersion,
} from "./publishedVersions.js";
import { checkOutputFolderUsable, writeSite } from "./siteWriting.js";

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1; // the build refused
const EXIT_MALFORMED_COMMAND = 2;
const USAGE =
  "usage: catalogue-building build FILE... --out FOLDER " +
  "(--previous-catalogue FILE | --start-new-calendar)\n" +
  "       [--build-date YYYY-MM-DD] [--built-at YYYY-MM-DDTHH:MM:SSZ]";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MOMENT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

type PrintLine = (line: string) => void;

interface BuildCommand {
  readonly reactionPaths: readonly string[];
  readonly outputFolder: string;
  /** undefined: start a new calendar. */
  readonly previousCataloguePath: string | undefined;
  readonly buildDate: string | undefined;
  readonly builtAt: string | undefined;
}

/** The moment as "YYYY-MM-DDTHH:MM:SSZ" in UTC, or "" for text that is no moment. */
function utcSecondText(momentText: string): string {
  const moment = new Date(momentText);
  return Number.isNaN(moment.getTime()) ? "" : `${moment.toISOString().slice(0, 19)}Z`;
}

/** "YYYY-MM-DD" naming a real day ("2026-02-30" does not). */
function isRealDate(text: string): boolean {
  return DATE_PATTERN.test(text) && utcSecondText(`${text}T00:00:00Z`).startsWith(text);
}

/** "YYYY-MM-DDTHH:MM:SSZ" naming a real moment. */
function isRealMoment(text: string): boolean {
  return MOMENT_PATTERN.test(text) && utcSecondText(text) === text;
}

/** The build command, or undefined if the arguments are malformed. */
function parsedBuildCommand(argumentTexts: readonly string[]): BuildCommand | undefined {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argumentTexts],
      allowPositionals: true,
      options: {
        out: { type: "string" },
        "previous-catalogue": { type: "string" },
        "start-new-calendar": { type: "boolean" },
        "build-date": { type: "string" },
        "built-at": { type: "string" },
      },
    });
  } catch {
    return undefined;
  }
  const [command, ...reactionPaths] = parsed.positionals;
  const { values } = parsed;
  const startsNewCalendar = values["start-new-calendar"] === true;
  const wellFormed =
    command === "build" &&
    reactionPaths.length > 0 &&
    values.out !== undefined &&
    startsNewCalendar !== (values["previous-catalogue"] !== undefined) &&
    (values["build-date"] === undefined || isRealDate(values["build-date"])) &&
    (values["built-at"] === undefined || isRealMoment(values["built-at"]));
  if (!wellFormed || values.out === undefined) {
    return undefined;
  }
  return {
    reactionPaths,
    outputFolder: values.out,
    previousCataloguePath: values["previous-catalogue"],
    buildDate: values["build-date"],
    builtAt: values["built-at"],
  };
}

function readPreviousCatalogue(cataloguePath: string): unknown {
  try {
    return JSON.parse(readFileSync(cataloguePath, "utf-8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CatalogueBuildError("previous-catalogue-not-readable", `${cataloguePath}: ${reason}`);
  }
}

/** Every file read and linted; lint warnings are printed as the linter prints them. */
async function readPublishedVersions(
  reactionPaths: readonly string[],
  printLine: PrintLine,
): Promise<PublishedVersion[]> {
  const toolkit = await loadChemistryToolkit();
  const publishedVersions = reactionPaths.map((reactionPath) => {
    const { publishedVersion, lintWarnings } = readPublishedVersion(reactionPath, toolkit);
    for (const finding of lintWarnings) {
      printLine(
        `${reactionPath}: ${finding.lintLevel} ${finding.lintRuleId} at ` +
          `${finding.instancePath || "/"}: ${finding.message}`,
      );
    }
    return publishedVersion;
  });
  checkVersionNumbering(publishedVersions);
  return publishedVersions;
}

/** Every check runs before the first file is written, so a refused build writes nothing. */
async function runBuild(command: BuildCommand, printLine: PrintLine): Promise<void> {
  checkOutputFolderUsable(command.outputFolder);
  const previousCatalogue =
    command.previousCataloguePath === undefined
      ? undefined
      : readPreviousCatalogue(command.previousCataloguePath);
  const publishedVersions = await readPublishedVersions(command.reactionPaths, printLine);
  const now = utcSecondText(new Date().toISOString());
  const buildDate = command.buildDate ?? now.slice(0, 10);
  const builtAt = command.builtAt ?? now;
  const catalogue = assembleCatalogue(publishedVersions, previousCatalogue, buildDate, builtAt);
  writeSite(command.outputFolder, catalogue, publishedVersions);
}

/** Run one command; returns the exit status. */
export async function runCatalogueBuilding(
  argumentTexts: readonly string[],
  printLine: PrintLine,
): Promise<number> {
  const command = parsedBuildCommand(argumentTexts);
  if (command === undefined) {
    printLine(USAGE);
    return EXIT_MALFORMED_COMMAND;
  }
  try {
    await runBuild(command, printLine);
  } catch (error) {
    if (error instanceof CatalogueBuildError) {
      printLine(`error ${error.errorCode}: ${error.message}`);
      return EXIT_FAILURE;
    }
    throw error;
  }
  return EXIT_SUCCESS;
}
