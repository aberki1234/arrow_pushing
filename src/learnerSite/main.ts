/** The learner site's entry point (Vite): mounts the app into #app. */
import { mount } from "svelte";
import { readProgress } from "../learnerProgress/learnerProgress.js";
import App from "./App.svelte";
import "./site.css";
import { browserStorage } from "./browserStorage.js";

// The theme the learner chose last time ("auto" follows the system setting).
const { theme } = readProgress(browserStorage).settings;
if (theme !== "auto") {
  document.documentElement.dataset["theme"] = theme;
}

const appElement = document.getElementById("app");
if (appElement === null) {
  throw new Error("index.html has no #app element");
}
/** VITE_CREATE_ADDRESS at build time (the deploy workflow), for the Create tab; else none. */
function createAddressFromBuild(): string | null {
  const address: unknown = import.meta.env["VITE_CREATE_ADDRESS"];
  return typeof address === "string" && address !== "" ? address : null;
}

mount(App, { target: appElement, props: { createAddress: createAddressFromBuild() } });
