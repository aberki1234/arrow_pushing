// Vite builds the learner site (src/learner/learnerSite) as a static single-page app; Vitest runs
// every *.test.ts under src/. The site's data (catalogue.json and r/…) is the catalogue build's
// output in build/site/, served as Vite's public folder in development (make catalogue first).
// `make site` builds the app into build/app/ and merges it with a fresh catalogue in build/site/.
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig } from "vitest/config";

function fromProjectRoot(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

export default defineConfig({
  root: fromProjectRoot("src/learner/learnerSite/app/"),
  publicDir: fromProjectRoot("build/site/"),
  base: "./",
  build: { outDir: fromProjectRoot("build/app/"), emptyOutDir: true },
  // configFile: false: the plugin's defaults suffice (no svelte.config.js).
  plugins: [svelte({ configFile: false }), svelteTesting()],
  // Many tests lint or replay whole example reactions (about 2 s each alone); with every test file
  // running in parallel, 5 s is not always enough, so tests get 30 s.
  // At most 4 test files at once: a worker with a PGlite database and RDKit.js peaks near 1.1 GB,
  // and the development laptop's WSL has 8 GB. Measured 2026-11-25: 4 workers, about 3.7 GB in
  // all and 50 s; Vitest's default (one per core, 11 here) used up the memory and froze WSL.
  test: {
    root: fromProjectRoot("."),
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
    maxWorkers: 4,
  },
});
