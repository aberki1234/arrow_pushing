/**
 * Build tools: `npx tsx src/buildTools/runFromShell.ts fetch-ketcher` fetches the pinned Ketcher
 * release into vendor/editor-public/ketcher (ketcherFiles.ts) unless that version is already there.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { KETCHER_FOLDER, KETCHER_RELEASE, unpackKetcherRelease } from "./ketcherFiles.js";

async function fetchKetcher(): Promise<void> {
  const marker = join(KETCHER_FOLDER, "VERSION");
  if (existsSync(marker) && readFileSync(marker, "utf-8") === KETCHER_RELEASE.version) {
    console.log(`Ketcher ${KETCHER_RELEASE.version} is already in ${KETCHER_FOLDER}`);
    return;
  }
  const response = await fetch(KETCHER_RELEASE.zipUrl);
  if (!response.ok) {
    throw new Error(`fetching Ketcher: HTTP ${String(response.status)}`);
  }
  const zipBytes = new Uint8Array(await response.arrayBuffer());
  unpackKetcherRelease(zipBytes, KETCHER_RELEASE.sha256, KETCHER_RELEASE.version, KETCHER_FOLDER);
  console.log(`Ketcher ${KETCHER_RELEASE.version} unpacked into ${KETCHER_FOLDER}`);
}

const [command] = process.argv.slice(2);
try {
  if (command !== "fetch-ketcher") {
    throw new Error("usage: runFromShell.ts fetch-ketcher");
  }
  await fetchKetcher();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
