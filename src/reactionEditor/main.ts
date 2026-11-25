/**
 * The reaction editor's entry point (Vite, `make editor`): mounts the editor into #app, with
 * RDKit.js loaded from the URL Vite serves its WebAssembly file at, the development server's
 * reaction-file requests (editorFileServer), and live lint in a Web Worker (lintWorker.ts).
 */
import { mount } from "svelte";
import rdkitWasmUrl from "@rdkit/rdkit/RDKit_minimal.wasm?url";
import { loadChemistryToolkit } from "../chemistryToolkit/chemistryToolkit.js";
import "../learnerSite/site.css";
import "./editor.css";
import EditorApp from "./EditorApp.svelte";
import { httpReactionFileStore } from "./reactionFileStore.js";
import { browserWorkerPort, workerLinter } from "./workerLinter.js";

const appElement = document.getElementById("app");
if (appElement === null) {
  throw new Error("index.html has no #app element");
}
mount(EditorApp, {
  target: appElement,
  props: {
    toolkitLoading: loadChemistryToolkit({ wasmLocation: rdkitWasmUrl }),
    fileStore: httpReactionFileStore(),
    lintDraft: workerLinter(
      browserWorkerPort(
        new Worker(new URL("./lintWorker.ts", import.meta.url), { type: "module" }),
      ),
    ),
  },
});
