/** The shell entry of the linter's command line (commandLine.ts): `npx tsx` runs this file. */
import { runReactionLinting } from "./commandLine.js";

process.exitCode = await runReactionLinting(process.argv.slice(2), (line) => {
  console.log(line);
});
