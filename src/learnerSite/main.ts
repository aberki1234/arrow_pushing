/** The learner site's entry point (Vite): mounts the app into #app. */
import { mount } from "svelte";
import App from "./App.svelte";
import "./site.css";

const appElement = document.getElementById("app");
if (appElement === null) {
  throw new Error("index.html has no #app element");
}
mount(App, { target: appElement });
