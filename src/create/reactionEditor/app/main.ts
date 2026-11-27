/**
 * The reaction editor's entry point: mounts the editor into #app, with RDKit.js loaded from the URL
 * Vite serves its WebAssembly file at and live lint in a Web Worker (lintWorker.ts).
 *
 * Where reactions are kept
 *   `make editor` (Vite's development server): content/reactions/, through the development
 *   server's reaction-file requests (editorFileServer).
 *   The built editor (`make editor-build`, served by the backend): the server's database, with
 *   sign-in, Publish and Edit (serverReactionStore.ts), submitting, review and users
 *   (contributorClient.ts).
 */
import { mount } from "svelte";
import rdkitWasmUrl from "@rdkit/rdkit/RDKit_minimal.wasm?url";
import { loadChemistryToolkit } from "../../../tooling/chemistryToolkit/chemistryToolkit.js";
import "../../../learner/learnerSite/site.css";
import { applySavedTheme } from "../../../learner/learnerSite/sharedTheme.js";
import "./editor.css";
import EditorApp from "./EditorApp.svelte";
import { contributorClient } from "../io/contributorClient.js";
import { httpReactionFileStore } from "../io/reactionFileStore.js";
import { serverReactionStore } from "../io/serverReactionStore.js";
import { browserWorkerPort, workerLinter } from "../io/workerLinter.js";

/** VITE_LEARNER_SITE_ADDRESS at build time (render.yaml), for "Back to the site"; else none. */
function learnerSiteAddressFromBuild(): string | null {
  const address: unknown = import.meta.env["VITE_LEARNER_SITE_ADDRESS"];
  return typeof address === "string" && address !== "" ? address : null;
}

// The theme chosen last time, here or on the learner site.
applySavedTheme();

const appElement = document.getElementById("app");
if (appElement === null) {
  throw new Error("index.html has no #app element");
}
const serverStore = import.meta.env.DEV ? undefined : serverReactionStore();
mount(EditorApp, {
  target: appElement,
  props: {
    toolkitLoading: loadChemistryToolkit({ wasmLocation: rdkitWasmUrl }),
    fileStore: serverStore ?? httpReactionFileStore(),
    publishing: serverStore,
    contributing: serverStore === undefined ? undefined : contributorClient(),
    learnerSiteAddress: learnerSiteAddressFromBuild(),
    lintDraft: workerLinter(
      browserWorkerPort(
        new Worker(new URL("../io/lintWorker.ts", import.meta.url), { type: "module" }),
      ),
    ),
  },
});
