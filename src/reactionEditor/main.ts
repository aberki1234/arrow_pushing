/**
 * The reaction editor's entry point (Vite, `make editor`): mounts the editor into #app, with
 * RDKit.js loaded from the URL Vite serves its WebAssembly file at, and the development server's
 * reaction-file requests (editorFileServer).
 */
import { mount } from "svelte";
import rdkitWasmUrl from "@rdkit/rdkit/RDKit_minimal.wasm?url";
import { loadChemistryToolkit } from "../chemistryToolkit/chemistryToolkit.js";
import "../learnerSite/site.css";
import "./editor.css";
import EditorApp from "./EditorApp.svelte";
import { httpReactionFileStore } from "./reactionFileStore.js";

const appElement = document.getElementById("app");
if (appElement === null) {
  throw new Error("index.html has no #app element");
}
mount(EditorApp, {
  target: appElement,
  props: {
    toolkitLoading: loadChemistryToolkit({ wasmLocation: rdkitWasmUrl }),
    fileStore: httpReactionFileStore(),
  },
});
