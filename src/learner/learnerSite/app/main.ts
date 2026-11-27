/** The learner site's entry point (Vite): mounts the app into #app. */
import { mount } from "svelte";
import App from "./App.svelte";
import "./site.css";
import { applySavedTheme } from "../io/sharedTheme.js";

// The theme chosen last time, on this site or on Create.
applySavedTheme();

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
