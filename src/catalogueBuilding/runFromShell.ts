/** The shell entry of the catalogue build's command line (commandLine.ts): `npx tsx` runs it. */
import { runCatalogueBuilding } from "./commandLine.js";

process.exitCode = await runCatalogueBuilding(process.argv.slice(2), (line) => {
  console.log(line);
});
