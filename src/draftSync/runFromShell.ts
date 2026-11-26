/**
 * The shell entry of the draft-sync command line (commandLine.ts):
 * `npx tsx src/draftSync/runFromShell.ts check|push-draft|pull-draft …`.
 */
import { loadChemistryToolkit } from "../chemistryToolkit/chemistryToolkit.js";
import type { LintFinding } from "../reactionLinting/lintFindings.js";
import { lintReaction } from "../reactionLinting/reactionLint.js";
import {
  type DraftSyncCommand,
  parseDraftSyncCommand,
  reactionFilePaths,
  serverConnectionFrom,
} from "./commandLine.js";
import { type DraftSyncSettings, pullDraftFile, pushDraftFile } from "./draftSync.js";
import { readFileSync } from "node:fs";

function findingLine(finding: LintFinding): string {
  return `  ${finding.lintLevel} ${finding.lintRuleId} ${finding.instancePath}: ${finding.message}`;
}

async function draftSyncSettings(needsServer: boolean): Promise<DraftSyncSettings> {
  const toolkit = await loadChemistryToolkit();
  const connection = needsServer
    ? serverConnectionFrom(process.env)
    : { serverUrl: "", accessToken: "" };
  return {
    ...connection,
    fetchFunction: (url, init) => fetch(url, init),
    lintDocument: (reactionDocument) => lintReaction(reactionDocument, toolkit),
  };
}

/** Run one command; answers whether every file or slug went through. */
async function runDraftSyncCommand(command: DraftSyncCommand): Promise<boolean> {
  const settings = await draftSyncSettings(command.commandName !== "check");
  let everyOneDone = true;
  if (command.commandName === "pull-draft") {
    for (const reactionSlug of command.reactionSlugs) {
      const pulled = await pullDraftFile(reactionSlug, command.folderPath, settings);
      everyOneDone &&= pulled.outcome === "pulled";
      console.log(reactionSlug, JSON.stringify(pulled));
    }
    return everyOneDone;
  }
  for (const filePath of reactionFilePaths(command.paths)) {
    if (command.commandName === "check") {
      const document = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
      const findings = settings.lintDocument(document);
      everyOneDone &&= !findings.some((finding) => finding.lintLevel === "error");
      console.log(`${filePath}: ${String(findings.length)} finding(s)`);
      for (const finding of findings) {
        console.log(findingLine(finding));
      }
      continue;
    }
    const pushed = await pushDraftFile(filePath, settings);
    everyOneDone &&= pushed.outcome === "pushed";
    console.log(
      filePath,
      pushed.outcome === "has-lint-errors" ? pushed.outcome : JSON.stringify(pushed),
    );
    if (pushed.outcome === "has-lint-errors") {
      for (const finding of pushed.lintFindings) {
        console.log(findingLine(finding));
      }
    }
  }
  return everyOneDone;
}

try {
  const everyOneDone = await runDraftSyncCommand(parseDraftSyncCommand(process.argv.slice(2)));
  process.exitCode = everyOneDone ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
