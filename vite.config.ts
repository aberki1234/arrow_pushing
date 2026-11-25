// Vite builds the learner site (src/learnerSite) as a static single-page app; Vitest runs every
// *.test.ts under src/. The site's data (catalogue.json and r/…) is the catalogue build's output
// in build/site/, served as Vite's public folder in development (make catalogue first).
// `make site` builds the app into build/app/ and merges it with a fresh catalogue in build/site/.
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig } from "vitest/config";

function fromProjectRoot(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

export default defineConfig({
  root: fromProjectRoot("src/learnerSite/"),
  publicDir: fromProjectRoot("build/site/"),
  base: "./",
  build: { outDir: fromProjectRoot("build/app/"), emptyOutDir: true },
  // configFile: false: the plugin's defaults suffice (no svelte.config.js).
  plugins: [svelte({ configFile: false }), svelteTesting()],
  // Many tests lint or replay whole example reactions (about 2 s each alone); with every test file
  // running in parallel, 5 s is not always enough, so tests get 30 s.
  test: { root: fromProjectRoot("."), include: ["src/**/*.test.ts"], testTimeout: 30_000 },
});
