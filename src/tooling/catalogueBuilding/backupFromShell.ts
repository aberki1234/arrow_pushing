/**
 * The deploy workflow's backup step (publishedBackup.ts), run with `npx tsx`:
 *
 *   backupFromShell.ts --from <export address> --out <folder>
 *
 * Fetches the server's export of published versions, checks it, writes each version to
 * <folder>/<slug>/<version>.json and prints the paths. Exit status 1 if anything is refused (then
 * nothing is written), 2 for a malformed command.
 */
import { parseArgs } from "node:util";
import { checkedExport, writePublishedBackup } from "./publishedBackup.js";

const EXIT_FAILURE = 1;
const EXIT_MALFORMED_COMMAND = 2;
const USAGE = "usage: backupFromShell.ts --from <export address> --out <folder>";

async function backUpPublishedVersions(exportAddress: string, backupFolder: string): Promise<void> {
  const exportResponse = await fetch(exportAddress);
  if (!exportResponse.ok) {
    throw new Error(`${exportAddress} answered ${String(exportResponse.status)}`);
  }
  const exportedVersions = checkedExport(await exportResponse.json());
  for (const writtenPath of writePublishedBackup(exportedVersions, backupFolder)) {
    console.log(writtenPath);
  }
}

const { values: optionToValue } = parseArgs({
  options: { from: { type: "string" }, out: { type: "string" } },
  strict: false,
});
const { from: exportAddress, out: backupFolder } = optionToValue;
if (typeof exportAddress !== "string" || typeof backupFolder !== "string") {
  console.error(USAGE);
  process.exitCode = EXIT_MALFORMED_COMMAND;
} else {
  try {
    await backUpPublishedVersions(exportAddress, backupFolder);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = EXIT_FAILURE;
  }
}
