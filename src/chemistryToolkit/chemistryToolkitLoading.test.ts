/**
 * Loading RDKit.js from a given WebAssembly location, as the editor does in the browser (where
 * Vite serves the .wasm file at its own URL). Its own file, because the toolkit is loaded once
 * per test file.
 */
import { createRequire } from "node:module";
import { expect, it } from "vitest";
import { loadChemistryToolkit } from "./chemistryToolkit.js";

it("loads from an explicit WebAssembly location", async () => {
  const wasmPath = createRequire(import.meta.url).resolve("@rdkit/rdkit/RDKit_minimal.wasm");
  const toolkit = await loadChemistryToolkit({ wasmLocation: wasmPath });
  expect(toolkit.readAtoms("[OH-:1]")).toEqual([{ element: "O", mapNumber: 1 }]);
});
