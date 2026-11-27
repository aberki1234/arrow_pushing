// @vitest-environment jsdom
/**
 * Component tests for Create (the decisions are tested in editorSession.ts, createView.ts and
 * src/create/reactionEditing; these check the wiring): a new mechanism from its name and SMILES, a
 * step drawn with the keyboard alone, undone, saved by itself; the Teaching to-do list; Publish's
 * checks going to their place; Play as learner; on the server, sign in, Edit and Publish, a
 * contributor's Submit for review, and a reviewer's queue and decision.
 * Layout is checked by eye in a browser, not here.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { beforeAll, expect, test } from "vitest";
import { loadChemistryToolkit } from "../../tooling/chemistryToolkit/chemistryToolkit.js";
import EditorApp from "./EditorApp.svelte";
import { lintRequestAnswerer } from "./lintRequests.js";
import { exampleReaction } from "../../testSupport/reactionEdits.js";
import type {
  ContributorClient,
  RequestOutcome,
  ReviewDecision,
  SignInProvider,
} from "./contributorClient.js";
import type { ListedReactionFile, ReactionFileStore } from "./reactionFileStore.js";
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

/** Render Create (unless `rendered`), then make the SN2 draft on the Start stage. */
async function createSn2Draft(
  fileStore: ReactionFileStore,
  options: { rendered?: boolean } = {},
): Promise<void> {
  if (options.rendered !== true) {
    render(EditorApp, {
      props: {
        toolkitLoading: loadChemistryToolkit(),
        fileStore,
        lintDraft,
        autosaveDelayMilliseconds: 0,
      },
    });
  }
  await fireEvent.click(await screen.findByRole("button", { name: /New mechanism/ }));
  await fireEvent.input(screen.getByLabelText(/What is this reaction called/), {
    target: { value: "SN2 test" },
  });
  await fireEvent.input(screen.getByLabelText(/What reacts/), { target: { value: "[OH-].CBr" } });
  const pushArrows = screen.getByRole("button", { name: "Push the arrows →" });
  await waitFor(() => {
    expect(pushArrows.hasAttribute("disabled")).toBe(false);
  });
  await fireEvent.click(pushArrows);
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
  await pressEnterOn("lone pair on O1");
  await pressEnterOn("C2");
  await pressEnterOn("bond C2–Br3");
  await pressEnterOn("Br3");
  await fireEvent.click(screen.getByRole("button", { name: "Make the step" }));
}

function stageButton(title: string): HTMLElement {
  return within(screen.getByRole("list", { name: "Stages" })).getByRole("button", {
    name: new RegExp(title),
  });
}

test("a new mechanism opens on Mechanism; a step is drawn, undone and redone", async () => {
  await createSn2Draft(memoryFileStore());
  expect(stageButton("Mechanism").getAttribute("aria-current")).toBe("step");
  await drawSubstitution();
  expect(screen.getByRole("status").textContent).toContain("Step made: Start → Product.");
  expect(screen.getByRole("button", { name: "Show Product" })).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(screen.queryByRole("button", { name: "Show Product" })).toBeNull();
  await fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
  expect(screen.getByRole("button", { name: "Show Product" })).toBeTruthy();
});

test("the draft saves by itself under its slug, made from the name", async () => {
  const fileStore = memoryFileStore();
  await createSn2Draft(fileStore);
  await drawSubstitution();
  await waitFor(() => {
    expect(
      (fileStore.saved.get("sn2-test.json") as { steps?: unknown[] } | undefined)?.steps,
    ).toHaveLength(1);
  });
  await waitFor(() => {
    expect(screen.getByText("Saved")).toBeTruthy();
  });
});

test("going back to Your mechanisms saves an unsaved draft at once", async () => {
  const fileStore = memoryFileStore();
  render(EditorApp, {
    props: {
      toolkitLoading: loadChemistryToolkit(),
      fileStore,
      lintDraft,
      autosaveDelayMilliseconds: 60_000,
    },
  });
  await createSn2Draft(fileStore, { rendered: true });
  await drawSubstitution();
  await fireEvent.click(stageButton("Teaching"));
  expect(fileStore.saved.has("sn2-test.json")).toBe(false);
  await fireEvent.click(
    screen.getAllByRole("button", { name: "← Your mechanisms" })[0] as HTMLElement,
  );
  await waitFor(() => {
    expect(
      (fileStore.saved.get("sn2-test.json") as { steps?: unknown[] } | undefined)?.steps,
    ).toHaveLength(1);
  });
});

test("the top bar links to the learner site's pages; its Create tab goes back home", async () => {
  render(EditorApp, {
    props: {
      toolkitLoading: loadChemistryToolkit(),
      fileStore: memoryFileStore(),
      lintDraft,
      learnerSiteAddress: "https://arrowpushing.com",
    },
  });
  const site = screen.getByRole("navigation", { name: "Site" });
  expect(within(site).getByRole("link", { name: "Practice" }).getAttribute("href")).toBe(
    "https://arrowpushing.com/#/practice",
  );
  const createTab = within(site).getByRole("link", { name: "Create" });
  expect(createTab.getAttribute("aria-current")).toBe("page");
  await fireEvent.click(await screen.findByRole("button", { name: /New mechanism/ }));
  await fireEvent.click(createTab);
  expect(await screen.findByRole("heading", { name: "Create" })).toBeTruthy();
});

test("Teaching lists what is needed; the question written is done, and undone", async () => {
  await createSn2Draft(memoryFileStore());
  await drawSubstitution();
  await fireEvent.click(stageButton("Teaching"));
  const question = screen.getByRole("button", { name: /Question the learner sees/ });
  expect(question.textContent).toContain("needed");
  await fireEvent.change(screen.getByLabelText(/What does the learner see/), {
    target: { value: "Push the arrows." },
  });
  expect(
    screen.getByRole("button", { name: /Question the learner sees/ }).textContent,
  ).not.toContain("needed");
  await fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(screen.getByLabelText<HTMLTextAreaElement>(/What does the learner see/).value).toBe("");
});

test("Publish lists the checks; Fix goes to the place, and the check clears", async () => {
  await createSn2Draft(memoryFileStore());
  await drawSubstitution();
  await fireEvent.click(stageButton("Publish"));
  const summaryTask = await screen.findByRole(
    "button",
    { name: /The summary at the end is empty/ },
    { timeout: 10000 },
  );
  await fireEvent.click(summaryTask);
  expect(stageButton("Teaching").getAttribute("aria-current")).toBe("step");
  await fireEvent.change(screen.getByLabelText(/Shown when the learner finishes/), {
    target: { value: "Backside attack." },
  });
  await fireEvent.click(stageButton("Publish"));
  await waitFor(
    () => {
      expect(screen.queryByRole("button", { name: /The summary at the end is empty/ })).toBeNull();
      expect(screen.queryByText("Checking…")).toBeNull();
    },
    { timeout: 10000 },
  );
});

test("a check on Publish itself opens its folded section and focuses the field", async () => {
  await createSn2Draft(memoryFileStore());
  await drawSubstitution();
  await fireEvent.click(stageButton("Publish"));
  const authorTask = await screen.findByRole(
    "button",
    { name: /Name at least one author/ },
    { timeout: 10000 },
  );
  const authors = screen.getByLabelText(/Authors/);
  expect(authors.closest("details")?.open).toBe(false);
  await fireEvent.click(authorTask);
  await waitFor(() => {
    expect(authors.closest("details")?.open).toBe(true);
    expect(document.activeElement).toBe(authors);
  });
  await fireEvent.click(screen.getByRole("button", { name: /Choose a reaction type/ }));
  await waitFor(() => {
    expect(document.activeElement?.closest('[data-field="reactionClasses"]')).not.toBeNull();
  });
});

test("Play as learner opens the learner's step screen on the draft, and goes back", async () => {
  await createSn2Draft(memoryFileStore());
  expect(screen.getByRole("button", { name: "▶ Play as learner" }).hasAttribute("disabled")).toBe(
    true,
  );
  await drawSubstitution();
  // Play starts from the selected state: after the step that is the product, so show the start.
  await fireEvent.click(screen.getByRole("button", { name: "Show Start" }));
  await fireEvent.click(screen.getByRole("button", { name: "▶ Play as learner" }));
  expect(screen.getByRole("button", { name: "Check" })).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "Back to editing" }));
  expect(screen.getByRole("list", { name: "Stages" })).toBeTruthy();
});

const ALDOL_LISTING: ListedReactionFile = {
  fileName: "aldol.json",
  reactionSlug: "aldol",
  title: "Aldol addition",
  newestReactionVersion: 1,
  newestSubmissionStatus: "published",
  ownerUserId: "owner-id",
  ownerName: "Owner Name",
  newestAuthorUserId: "owner-id",
  newestAuthorName: "Owner Name",
  creationProgress: {
    arrowStepCount: 3,
    teachingDoneCount: 14,
    teachingItemCount: 14,
    neededLeftCount: 0,
  },
};

/**
 * The built editor's store, in memory: a server where the user may or may not be signed in, with
 * the site actions of their role. `calls` records the order of saves and publishes.
 */
function memoryServerStore(
  signedIn: boolean,
  siteActions: readonly string[] = ["createReactions", "publish"],
): ServerReactionStore & { saved: Map<string, unknown>; calls: string[] } {
  const saved = new Map<string, unknown>();
  const calls: string[] = [];
  return {
    saved,
    calls,
    storagePlace: "the server",
    list: () => Promise.resolve([ALDOL_LISTING]),
    read: (fileName) => Promise.resolve(saved.get(fileName) as Record<string, unknown>),
    save: (fileName, document): Promise<void> => {
      calls.push(`save ${fileName}`);
      saved.set(fileName, document);
      return Promise.resolve();
    },
    signedInUser: () =>
      Promise.resolve(
        signedIn ? { userId: "owner-id", displayName: "Owner Name", siteActions } : null,
      ),
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

/** The contributor and review API, in memory: one SN2 submission waiting. `calls` records each. */
function memoryContributorClient(calls: string[]): ContributorClient {
  const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
  return {
    signInProviders: (): Promise<SignInProvider[]> => Promise.resolve(["github", "google"]),
    signInAddress: (provider) => Promise.resolve(`https://${provider}.example/authorize?state=x`),
    submit: (reactionSlug, licenceAgreed, submissionNote): Promise<RequestOutcome> => {
      calls.push(`submit ${reactionSlug} ${String(licenceAgreed)} ${submissionNote}`);
      return Promise.resolve({ outcome: "done" });
    },
    reviewNotes: () => Promise.resolve(null),
    reviewQueue: () =>
      Promise.resolve([
        {
          reactionSlug: "sn2-hydroxide-bromomethane",
          reactionVersion: 1,
          title: "SN2 substitution",
          authorName: "Sam Lee",
          ownerName: "Sam Lee",
          submittedAt: new Date().toISOString(),
          submissionNote: "First one",
          queueKind: "newReaction",
        },
      ]),
    reviewMaterial: (reactionSlug) =>
      Promise.resolve({
        reactionSlug,
        reactionVersion: 1,
        submitted: sn2,
        previousPublished: null,
        previousVersion: null,
        authorName: "Sam Lee",
        submissionNote: "First one",
      }),
    review: (
      reactionSlug,
      decision: { reviewDecision: ReviewDecision; comment: string },
    ): Promise<RequestOutcome> => {
      calls.push(`review ${reactionSlug} ${decision.reviewDecision} ${decision.comment}`);
      return Promise.resolve({ outcome: "done" });
    },
    signOut: (): Promise<void> => {
      calls.push("sign-out");
      return Promise.resolve();
    },
    users: () => Promise.resolve([]),
    setRole: () => Promise.resolve({ outcome: "done" }),
  };
}

function renderOnServer(
  serverStore: ServerReactionStore & { calls?: string[] },
  goToAddress?: (address: string) => void,
  autosaveDelayMilliseconds = 0,
): void {
  render(EditorApp, {
    props: {
      toolkitLoading: loadChemistryToolkit(),
      fileStore: serverStore,
      publishing: serverStore,
      contributing: memoryContributorClient(serverStore.calls ?? []),
      lintDraft,
      autosaveDelayMilliseconds,
      ...(goToAddress === undefined ? {} : { goToAddress }),
    },
  });
}

test("on the server, not signed in: each provider's button goes to its address", async () => {
  const visitedAddresses: string[] = [];
  renderOnServer(memoryServerStore(false), (address) => visitedAddresses.push(address));
  await fireEvent.click(await screen.findByRole("button", { name: "Sign in with GitHub" }));
  await fireEvent.click(await screen.findByRole("button", { name: "Sign in with Google" }));
  await waitFor(() => {
    expect(visitedAddresses).toEqual([
      "https://github.example/authorize?state=x",
      "https://google.example/authorize?state=x",
    ]);
  });
});

test("on the server: the list shows status and progress; Edit opens the next version", async () => {
  const serverStore = memoryServerStore(true);
  renderOnServer(serverStore);
  const list = await screen.findByRole("region", { name: "Your mechanisms" });
  expect(list.textContent).toContain("Published");
  expect(list.textContent).toContain("3 steps · teaching done");
  await fireEvent.click(within(list).getByRole("button", { name: "Edit as version 2" }));
  await screen.findByRole("heading", {
    name: String(exampleReaction("aldol-addition-base.json").title),
  });
  expect(serverStore.calls).toEqual(["next-version aldol"]);
});

test("on the server: a draft names its author; Publish saves first, sends the tick", async () => {
  const serverStore = memoryServerStore(true);
  renderOnServer(serverStore);
  await createSn2Draft(serverStore, { rendered: true });
  await fireEvent.click(stageButton("Publish"));
  await fireEvent.click(screen.getByRole("checkbox", { name: /CC BY-SA 4\.0/ }));
  await fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  await waitFor(() => {
    expect(screen.getByRole("status").textContent).toContain("Published version 1.");
  });
  expect(serverStore.calls.slice(-2)).toEqual(["save sn2-test.json", "publish sn2-test true"]);
  expect((serverStore.saved.get("sn2-test.json") as { authors: unknown }).authors).toEqual([
    { name: "Owner Name", url: null },
  ]);
});

test("there is no Publish in file mode, nor for a role that may not publish", async () => {
  await createSn2Draft(memoryFileStore());
  await fireEvent.click(stageButton("Publish"));
  expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
  cleanup();
  const contributorStore = memoryServerStore(true, ["createReactions", "submitForReview"]);
  renderOnServer(contributorStore);
  await createSn2Draft(contributorStore, { rendered: true });
  await fireEvent.click(stageButton("Publish"));
  expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
});

test("a contributor submits for review: saved first, with the tick and the note", async () => {
  const contributorStore = memoryServerStore(true, ["createReactions", "submitForReview"]);
  renderOnServer(contributorStore);
  await createSn2Draft(contributorStore, { rendered: true });
  await fireEvent.click(stageButton("Publish"));
  await fireEvent.click(screen.getByRole("checkbox", { name: /CC BY-SA 4\.0/ }));
  await fireEvent.input(screen.getByLabelText(/Note for the reviewer/), {
    target: { value: "Please check" },
  });
  await fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
  await waitFor(() => {
    expect(screen.getByText("Submitted for review.")).toBeTruthy();
  });
  expect(contributorStore.calls.slice(-2)).toEqual([
    "save sn2-test.json",
    "submit sn2-test true Please check",
  ]);
});

test("a reviewer opens the queue, reviews a submission and requests changes", async () => {
  const reviewerStore = memoryServerStore(true, ["createReactions", "review"]);
  renderOnServer(reviewerStore);
  const reviewTab = await screen.findByRole("button", { name: /^Review/ });
  await waitFor(() => {
    expect(reviewTab.textContent).toContain("1");
  });
  expect(screen.queryByRole("button", { name: "Users" })).toBeNull();
  await fireEvent.click(reviewTab);
  await fireEvent.click(await screen.findByRole("button", { name: "Review SN2 substitution" }));
  await screen.findByRole("article", { name: "Name" });
  await fireEvent.input(screen.getByLabelText(/Overall note/), { target: { value: "Nearly" } });
  await fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
  await screen.findByText(/Changes requested on SN2 substitution/);
  expect(reviewerStore.calls).toContain(
    "review sn2-hydroxide-bromomethane changes_requested Nearly",
  );
});

test("an edit submitted before the autosave's wait is not saved again after Submit", async () => {
  const contributorStore = memoryServerStore(true, ["createReactions", "submitForReview"]);
  renderOnServer(contributorStore, undefined, 150);
  await createSn2Draft(contributorStore, { rendered: true });
  await fireEvent.click(stageButton("Publish"));
  await fireEvent.change(screen.getByLabelText(/One-line description/), {
    target: { value: "Hydroxide displaces bromide" },
  });
  await fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
  await screen.findByText("Submitted for review.");
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(contributorStore.calls.at(-1)).toMatch(/^submit sn2-test/);
});

test("Sign out (only when signed in) ends the session and reloads Create", async () => {
  const visitedAddresses: string[] = [];
  const serverStore = memoryServerStore(true);
  renderOnServer(serverStore, (address) => visitedAddresses.push(address));
  await fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
  await waitFor(() => {
    expect(visitedAddresses).toEqual(["/"]);
  });
  expect(serverStore.calls).toContain("sign-out");
  cleanup();
  renderOnServer(memoryServerStore(false));
  await screen.findByRole("button", { name: "Sign in with GitHub" });
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
});
