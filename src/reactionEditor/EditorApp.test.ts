// @vitest-environment jsdom
/**
 * A few component tests for the editor page (the decisions are tested in editorSession.ts and
 * src/reactionEditing; these check the wiring): create a draft from SMILES, draw a step with the
 * keyboard alone, undo it, save it, and play it as a learner; on the server, sign in, Edit and
 * Publish. Layout is checked by eye in a browser, not here.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeAll, expect, test } from "vitest";
import { loadChemistryToolkit } from "../chemistryToolkit/chemistryToolkit.js";
import EditorApp from "./EditorApp.svelte";
import { lintRequestAnswerer } from "../reactionEditing/lintRequests.js";
import { exampleReaction } from "../testSupport/reactionEdits.js";
import type { ReactionFileStore } from "./reactionFileStore.js";
import type { PublishOutcome, ServerReactionStore } from "./serverReactionStore.js";
import type { DraftLinter } from "./workerLinter.js";

beforeAll(() => {
  // jsdom has no matchMedia: answer as an author who prefers reduced motion (StepPlay asks).
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => undefined,
    }) as unknown as MediaQueryList;
});

/** An in-memory content/reactions/ folder. */
function memoryFileStore(): ReactionFileStore & { saved: Map<string, unknown> } {
  const saved = new Map<string, unknown>();
  return {
    saved,
    storagePlace: "content/reactions/",
    list: () => Promise.resolve([]),
    read: (fileName) => Promise.resolve(saved.get(fileName) as Record<string, unknown>),
    save: (fileName, document): Promise<void> => {
      saved.set(fileName, document);
      return Promise.resolve();
    },
  };
}

/** Lint in the test's own thread (the page uses a worker). */
const answerLint = lintRequestAnswerer(loadChemistryToolkit());
const lintDraft: DraftLinter = async (document) =>
  (await answerLint({ requestId: 1, document })).lintFindings;

/** Create the SN2 draft from the start panel, rendering the editor first unless `rendered`. */
async function createSn2Draft(
  fileStore: ReactionFileStore,
  options: { rendered?: boolean } = {},
): Promise<void> {
  if (options.rendered !== true) {
    render(EditorApp, { props: { toolkitLoading: loadChemistryToolkit(), fileStore, lintDraft } });
  }
  const create = await screen.findByRole("button", { name: "Create" });
  await fireEvent.input(screen.getByLabelText(/Slug/), { target: { value: "sn2-test" } });
  await fireEvent.input(screen.getByLabelText("Title"), { target: { value: "SN2 test" } });
  await fireEvent.input(screen.getByLabelText(/Start structure/), {
    target: { value: "[OH-].CBr" },
  });
  await fireEvent.click(create);
  await screen.findByRole("heading", { name: "SN2 test" });
}

async function pressEnterOn(accessibleName: string): Promise<void> {
  const [target] = screen.getAllByRole("button", { name: accessibleName });
  if (target === undefined) {
    throw new Error(`no pick target named ${accessibleName}`);
  }
  target.focus();
  await fireEvent.keyDown(target, { key: "Enter" });
}

async function drawSubstitution(): Promise<void> {
  await fireEvent.click(screen.getByRole("button", { name: "Draw arrows" }));
  await pressEnterOn("lone pair on O1");
  await pressEnterOn("C2");
  await pressEnterOn("bond C2–Br3");
  await pressEnterOn("Br3");
  await fireEvent.click(screen.getByRole("button", { name: "Make step" }));
}

test("a new draft from SMILES, a step drawn with the keyboard, undone and redone", async () => {
  await createSn2Draft(memoryFileStore());
  await drawSubstitution();
  expect(screen.getByRole("status").textContent).toContain("Added step-1 to a new state, state-2.");
  expect(screen.getByRole("navigation", { name: "Mechanism" }).textContent).toContain("state-2");
  await fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(screen.getByRole("navigation", { name: "Mechanism" }).textContent).not.toContain(
    "state-2",
  );
  await fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
  expect(screen.getByRole("navigation", { name: "Mechanism" }).textContent).toContain("state-2");
});

test("saving writes the draft under its slug", async () => {
  const fileStore = memoryFileStore();
  await createSn2Draft(fileStore);
  await drawSubstitution();
  await fireEvent.click(screen.getByRole("button", { name: "Save sn2-test.json" }));
  await waitFor(() => {
    expect(fileStore.saved.has("sn2-test.json")).toBe(true);
  });
  const saved = fileStore.saved.get("sn2-test.json") as { steps: unknown[] };
  expect(saved.steps).toHaveLength(1);
});

test("Play as learner opens the learner's step screen on the draft, and goes back", async () => {
  await createSn2Draft(memoryFileStore());
  expect(screen.getByRole("button", { name: "Play as learner" }).hasAttribute("disabled")).toBe(
    true,
  );
  await drawSubstitution();
  // Play starts from the selected state: after the step that is the product, so pick the start.
  await fireEvent.click(screen.getByRole("button", { name: "state-1 (start)" }));
  await fireEvent.click(screen.getByRole("button", { name: "Play as learner" }));
  expect(screen.getByRole("button", { name: "Check" })).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "Back to editing" }));
  expect(screen.getByRole("navigation", { name: "Mechanism" })).toBeTruthy();
});

test("live lint lists findings, goes to their place, and clears once fixed", async () => {
  await createSn2Draft(memoryFileStore());
  await drawSubstitution();
  await fireEvent.click(screen.getByRole("tab", { name: /Lint/ }));
  const summaryFinding = await screen.findByRole(
    "button",
    { name: /minLength/ },
    { timeout: 10000 },
  );
  await fireEvent.click(summaryFinding);
  expect(screen.getByRole("tab", { name: "Reaction" }).getAttribute("aria-selected")).toBe("true");
  const summary = screen.getByLabelText(/Mechanism summary/);
  await fireEvent.change(summary, { target: { value: "Backside attack." } });
  await fireEvent.click(screen.getByRole("tab", { name: /Lint/ }));
  await waitFor(
    () => {
      expect(screen.queryByRole("button", { name: /minLength/ })).toBeNull();
    },
    { timeout: 10000 },
  );
});

test("a learner prompt typed in the State tab is saved, and can be undone", async () => {
  await createSn2Draft(memoryFileStore());
  await fireEvent.change(screen.getByLabelText("Learner prompt"), {
    target: { value: "Push the arrows." },
  });
  expect(screen.getByLabelText<HTMLInputElement>("Learner prompt").value).toBe("Push the arrows.");
  await fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(screen.getByLabelText<HTMLInputElement>("Learner prompt").value).toBe("");
});

/**
 * The built editor's store, in memory: a server where the owner may or may not be signed in.
 * `calls` records the order of saves and publishes.
 */
function memoryServerStore(signedIn: boolean): ServerReactionStore & {
  saved: Map<string, unknown>;
  calls: string[];
} {
  const saved = new Map<string, unknown>();
  const calls: string[] = [];
  return {
    saved,
    calls,
    storagePlace: "the server",
    list: () =>
      Promise.resolve([
        {
          fileName: "aldol.json",
          reactionSlug: "aldol",
          title: "Aldol addition",
          newestReactionVersion: 1,
          newestSubmissionStatus: "published",
        },
      ]),
    read: (fileName) => Promise.resolve(saved.get(fileName) as Record<string, unknown>),
    save: (fileName, document): Promise<void> => {
      calls.push(`save ${fileName}`);
      saved.set(fileName, document);
      return Promise.resolve();
    },
    signedInName: () => Promise.resolve(signedIn ? "Owner Name" : null),
    signInAddress: () => Promise.resolve("https://github.com/login/oauth/authorize?state=x"),
    publish: (reactionSlug, licenceAgreed): Promise<PublishOutcome> => {
      calls.push(`publish ${reactionSlug} ${String(licenceAgreed)}`);
      return Promise.resolve({
        outcome: "published",
        reactionVersion: 1,
        lintWarningCount: 0,
        deployStart: "started",
      });
    },
    startNextVersion: (reactionSlug): Promise<number> => {
      calls.push(`next-version ${reactionSlug}`);
      saved.set(`${reactionSlug}.json`, { ...exampleReaction("aldol-addition-base.json") });
      return Promise.resolve(2);
    },
  };
}

test("on the server, not signed in: Sign in with GitHub goes to GitHub's address", async () => {
  const visitedAddresses: string[] = [];
  render(EditorApp, {
    props: {
      toolkitLoading: loadChemistryToolkit(),
      fileStore: memoryServerStore(false),
      publishing: memoryServerStore(false),
      lintDraft,
      goToAddress: (address: string) => visitedAddresses.push(address),
    },
  });
  await fireEvent.click(await screen.findByRole("button", { name: "Sign in with GitHub" }));
  await waitFor(() => {
    expect(visitedAddresses).toEqual(["https://github.com/login/oauth/authorize?state=x"]);
  });
});

test("on the server: the list shows each status, and Edit opens the next version", async () => {
  const serverStore = memoryServerStore(true);
  render(EditorApp, {
    props: {
      toolkitLoading: loadChemistryToolkit(),
      fileStore: serverStore,
      publishing: serverStore,
      lintDraft,
    },
  });
  expect(await screen.findByText("published v1")).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "Edit as version 2" }));
  await screen.findByRole("heading", {
    name: String(exampleReaction("aldol-addition-base.json").title),
  });
  expect(serverStore.calls).toEqual(["next-version aldol"]);
});

test("on the server: Publish saves first, sends the licence tick, shows the outcome", async () => {
  const serverStore = memoryServerStore(true);
  render(EditorApp, {
    props: {
      toolkitLoading: loadChemistryToolkit(),
      fileStore: serverStore,
      publishing: serverStore,
      lintDraft,
    },
  });
  await createSn2Draft(serverStore, { rendered: true });
  await fireEvent.click(screen.getByRole("checkbox", { name: /CC BY-SA 4\.0/ }));
  await fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  await waitFor(() => {
    expect(screen.getByRole("status").textContent).toContain("Published version 1.");
  });
  expect(serverStore.calls).toEqual(["save sn2-test.json", "publish sn2-test true"]);
});

test("in file mode there is no Publish", async () => {
  await createSn2Draft(memoryFileStore());
  expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
});
