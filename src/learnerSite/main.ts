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
mount(App, { target: appElement });
