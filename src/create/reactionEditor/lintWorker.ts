/**
 * The editor's lint worker (a Web Worker): lints each draft it is sent with the full linter
 * (reactionEditor/lintRequests.ts), RDKit.js loaded once from the URL Vite serves it at.
 */
import rdkitWasmUrl from "@rdkit/rdkit/RDKit_minimal.wasm?url";
import { loadChemistryToolkit } from "../../tooling/chemistryToolkit/chemistryToolkit.js";
import { type LintRequest, lintRequestAnswerer } from "./lintRequests.js";

const answer = lintRequestAnswerer(loadChemistryToolkit({ wasmLocation: rdkitWasmUrl }));

self.onmessage = (event: MessageEvent<LintRequest>): void => {
  void answer(event.data).then((answered) => {
    self.postMessage(answered);
  });
};
