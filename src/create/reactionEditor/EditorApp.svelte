<script lang="ts">
  // Create (docs/SPEC.md §5, "Create"): Your mechanisms, then a new mechanism's Start stage or a
  // draft open in its stages (CreateWorkspace.svelte); "Play as learner" shows the learner's own
  // step screen (learnerSite/StepPlay.svelte) on the draft. A draft is saved by itself about
  // autosaveDelayMilliseconds after the last edit (on the server, or in content/reactions/).
  // On the server, Create's sub-navigation adds Review (reviewers) and Users (the owner), and the
  // Publish stage submits for review for anyone but the owner (docs/SPEC.md §6, "Contributors").
  import { onMount } from "svelte";
  import type { ChemistryToolkit } from "../../tooling/chemistryToolkit/chemistryToolkit.js";
  import StepPlay from "../../learner/learnerSite/StepPlay.svelte";
  import type { ReactionDocument } from "../reactionEditing/reactionDraft.js";
  import { startPreview } from "../reactionEditing/learnerPreview.js";
  import type { StepSession } from "../../learner/stepSession/stepSession.js";
  import SiteHeader from "../../learner/learnerSite/SiteHeader.svelte";
  import { navigationTabs } from "../../learner/learnerSite/siteNavigation.js";
  import { publishAndDescribe } from "./batchPublishing.js";
  import CreateHome from "./CreateHome.svelte";
  import CreateSubnav from "./CreateSubnav.svelte";
  import CreateWorkspace from "./CreateWorkspace.svelte";
  import type {
    ContributorClient,
    QueuedSubmission,
    ReviewNotes,
    SignInProvider,
  } from "./contributorClient.js";
  import { createdDraft, type DraftStart } from "./draftCreation.js";
  import { currentDraft, type EditorSession, openDraft } from "./editorSession.js";
  import type { ListedReactionFile, ReactionFileStore } from "./reactionFileStore.js";
  import {
    publishOutcomeMessage,
    type ReactionPublishing,
    type SignedInUser,
    slugOfFileName,
  } from "./serverReactionStore.js";
  import ReviewQueue from "./ReviewQueue.svelte";
  import ReviewScreen from "./ReviewScreen.svelte";
  import { type CreateSection, createSections, type SubmitControls } from "./reviewView.js";
  import StageStepper from "./StageStepper.svelte";
  import UsersPage from "./UsersPage.svelte";
  import StartStage from "./StartStage.svelte";
  import type { DraftLinter } from "./workerLinter.js";

  const {
    toolkitLoading,
    fileStore,
    lintDraft,
    publishing,
    contributing,
    learnerSiteAddress = null,
    autosaveDelayMilliseconds = 1500,
    goToAddress = (address: string): void => {
      window.location.assign(address);
    },
  }: {
    toolkitLoading: Promise<ChemistryToolkit>;
    fileStore: ReactionFileStore;
    /** Live lint (a worker in the browser: workerLinter.ts). */
    lintDraft: DraftLinter;
    /** The built editor on the server: signing in, Publish and Edit. Absent with make editor. */
    publishing?: ReactionPublishing | undefined;
    /** The built editor on the server: signing in, submitting, review and users. */
    contributing?: ContributorClient | undefined;
    /** The learner site, for the top bar's tabs (null: make editor, only Create's tab). */
    learnerSiteAddress?: string | null;
    autosaveDelayMilliseconds?: number;
    /** Send the browser to another address (GitHub's sign-in page). */
    goToAddress?: (address: string) => void;
  } = $props();

  let toolkit = $state.raw<ChemistryToolkit | null>(null);
  let files = $state.raw<ListedReactionFile[] | null>(null);
  let view = $state<"home" | "new" | "draft">("home");
  // Raw state: sessions are never changed in place, and deep proxies would break structuredClone.
  let session = $state.raw<EditorSession | null>(null);
  let preview = $state.raw<StepSession | null>(null);
  let homeMessage = $state("");
  let signedInUser = $state.raw<SignedInUser | null>(null);
  let signInNeeded = $state(false);
  let saveStatus = $state("Saved");
  let lastSavedDraft: ReactionDocument | null = null;

  let signInProviders = $state.raw<SignInProvider[]>(["github"]);
  let section = $state<CreateSection>("mine");
  let reviewSlug = $state<string | null>(null);
  let queue = $state.raw<QueuedSubmission[] | null>(null);
  let queueMessage = $state("");
  // The open draft's submission status as last known, and the reviewer's notes on it.
  let draftStatus = $state("draft");
  let reviewNotes = $state.raw<ReviewNotes | null>(null);

  const mayPublish = $derived(signedInUser?.siteActions.includes("publish") === true);
  const sections = $derived(createSections(signedInUser?.siteActions ?? []));
  const submitting = $derived<SubmitControls | undefined>(
    contributing !== undefined &&
      !mayPublish &&
      signedInUser?.siteActions.includes("submitForReview") === true
      ? { reviewNotes, submissionStatus: draftStatus, onSubmit: submitCurrent }
      : undefined,
  );

  function loadQueue(): void {
    if (contributing === undefined || !sections.includes("review")) {
      return;
    }
    contributing.reviewQueue().then(
      (loaded) => {
        queue = loaded;
      },
      () => {
        queue = [];
      },
    );
  }

  function listFiles(): void {
    fileStore.list().then(
      (listed) => {
        files = listed;
      },
      () => {
        files = null;
      },
    );
  }

  onMount(() => {
    void toolkitLoading.then((loaded) => {
      toolkit = loaded;
    });
    if (publishing === undefined) {
      listFiles();
      return;
    }
    void publishing.signedInUser().then((user) => {
      signedInUser = user;
      signInNeeded = user === null;
      if (!signInNeeded) {
        listFiles();
        loadQueue();
      } else {
        contributing?.signInProviders().then(
          (providers) => {
            signInProviders = providers;
          },
          () => undefined,
        );
      }
    });
  });

  function reasonOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  function showDraft(document: ReactionDocument, fileName: string): void {
    const listing = files?.find((file) => file.fileName === fileName);
    draftStatus = listing?.newestSubmissionStatus ?? "draft";
    reviewNotes = null;
    if (contributing !== undefined && draftStatus === "changes_requested") {
      contributing.reviewNotes(slugOfFileName(fileName)).then(
        (notes) => {
          reviewNotes = notes;
        },
        () => undefined,
      );
    }
    session = openDraft(document, fileName);
    lastSavedDraft = document;
    saveStatus = "Saved";
    view = "draft";
  }

  /** Back to Your mechanisms, saving at once what the autosave has not saved yet. */
  async function goHome(): Promise<void> {
    const leaving = session;
    session = null;
    preview = null;
    view = "home";
    homeMessage = "";
    if (leaving !== null && currentDraft(leaving) !== lastSavedDraft) {
      await save(leaving);
    }
    listFiles();
    loadQueue();
  }

  function showSection(next: CreateSection): void {
    section = next;
    reviewSlug = null;
    queueMessage = "";
    void goHome();
  }

  function leaveToHome(): void {
    void goHome();
  }

  function open(fileName: string): void {
    fileStore.read(fileName).then(
      (document) => {
        showDraft(document, fileName);
      },
      (error: unknown) => {
        homeMessage = reasonOf(error);
      },
    );
  }

  function openLocal(file: File): void {
    file.text().then(
      (text) => {
        showDraft(JSON.parse(text) as Record<string, unknown>, file.name);
      },
      (error: unknown) => {
        homeMessage = reasonOf(error);
      },
    );
  }

  function create(fields: DraftStart): void {
    if (toolkit === null) {
      return;
    }
    const takenSlugs = (files ?? []).map((file) => file.reactionSlug ?? "");
    const creation = createdDraft(
      { ...fields, authorName: signedInUser?.displayName },
      takenSlugs,
      toolkit,
    );
    if (creation.outcome === "refused") {
      homeMessage = creation.reason;
      return;
    }
    const fileName = `${String(creation.document.reactionSlug)}.json`;
    session = openDraft(creation.document, fileName);
    lastSavedDraft = null;
    draftStatus = "draft";
    reviewNotes = null;
    view = "draft";
  }

  async function save(current: EditorSession): Promise<void> {
    const savedDraft = currentDraft(current);
    saveStatus = "Saving…";
    try {
      await fileStore.save(current.fileName, savedDraft);
      lastSavedDraft = savedDraft;
      // Saving a submitted version takes it out of review (reactionDatabase/reactionVersions.ts).
      if (draftStatus === "submitted") {
        draftStatus = "draft";
      }
      if (session !== null && currentDraft(session) === savedDraft) {
        saveStatus = "Saved";
      }
    } catch (error) {
      saveStatus = `Not saved: ${reasonOf(error)}`;
    }
  }

  // The draft alone: selecting, switching stages and drawing leave it the same object, so they
  // do not restart the autosave's wait.
  const draft = $derived(session === null ? null : currentDraft(session));

  // Save a draft that changed, autosaveDelayMilliseconds after its last edit.
  $effect(() => {
    const changed = draft;
    if (changed === null || changed === lastSavedDraft) {
      return;
    }
    saveStatus = "Not saved yet";
    const timer = setTimeout(() => {
      // Submit or Publish may have saved this draft already (a late save would take a
      // submitted version out of review).
      if (session !== null && currentDraft(session) !== lastSavedDraft) {
        void save(session);
      }
    }, autosaveDelayMilliseconds);
    return () => {
      clearTimeout(timer);
    };
  });

  function signIn(provider: SignInProvider): void {
    contributing?.signInAddress(provider).then(goToAddress, (error: unknown) => {
      homeMessage = reasonOf(error);
    });
  }

  /** Save what the autosave has not saved yet, end the session, and start Create again. */
  async function signOut(): Promise<void> {
    if (contributing === undefined) {
      return;
    }
    await goHome();
    try {
      await contributing.signOut();
      goToAddress("/");
    } catch (error) {
      homeMessage = `Not signed out: ${reasonOf(error)}`;
    }
  }

  /** Save first, so that what is submitted is what is on screen. */
  async function saveAndSubmit(
    current: EditorSession,
    licenceAgreed: boolean,
    submissionNote: string,
  ): Promise<void> {
    if (contributing === undefined) {
      return;
    }
    await save(current);
    const outcome = await contributing.submit(
      slugOfFileName(current.fileName),
      licenceAgreed,
      submissionNote,
    );
    if (outcome.outcome === "refused") {
      const findingsNote = outcome.lintFindingCount > 0 ? " (see the checks above)" : "";
      session = {
        ...current,
        message: { tone: "bad", text: `Not submitted: ${outcome.reason}${findingsNote}` },
      };
      return;
    }
    draftStatus = "submitted";
    reviewNotes = null;
    session = { ...current, message: { tone: "good", text: "Submitted for review." } };
  }

  function submitCurrent(licenceAgreed: boolean, submissionNote: string): void {
    if (session !== null) {
      void saveAndSubmit(session, licenceAgreed, submissionNote);
    }
  }

  function editNextVersion(fileName: string): void {
    publishing?.startNextVersion(slugOfFileName(fileName)).then(
      () => {
        open(fileName);
      },
      (error: unknown) => {
        homeMessage = reasonOf(error);
      },
    );
  }

  /** Save first, so that what is published is what is on screen. */
  async function saveAndPublish(current: EditorSession, licenceAgreed: boolean): Promise<void> {
    if (publishing === undefined) {
      return;
    }
    try {
      await save(current);
      const outcome = await publishing.publish(slugOfFileName(current.fileName), licenceAgreed);
      session = { ...current, message: publishOutcomeMessage(outcome) };
    } catch (error) {
      session = { ...current, message: { tone: "bad", text: `Not published: ${reasonOf(error)}` } };
    }
  }

  function download(current: EditorSession): void {
    const text = `${JSON.stringify(currentDraft(current), null, 2)}\n`;
    const link = window.document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    link.download = current.fileName;
    link.click();
    URL.revokeObjectURL(link.href);
  }
</script>

<SiteHeader
  tabs={navigationTabs({ learnerSiteAddress, createAddress: "/" })}
  currentTab="create"
  brandHref={learnerSiteAddress === null ? "/" : `${learnerSiteAddress.replace(/\/$/, "")}/#/`}
  onCurrentTab={leaveToHome}
  onSignOut={signedInUser !== null && contributing !== undefined
    ? () => {
        void signOut();
      }
    : undefined}
/>
<main class="wrap">
  {#if view === "home" && !signInNeeded}
    <CreateSubnav
      {sections}
      current={section}
      reviewCount={queue === null ? null : queue.length}
      onSection={showSection}
    />
  {/if}
  {#if view === "home" && section === "review" && contributing !== undefined}
    {#if reviewSlug === null}
      <ReviewQueue
        {queue}
        message={queueMessage}
        onReview={(reactionSlug: string) => {
          reviewSlug = reactionSlug;
        }}
      />
    {:else}
      <ReviewScreen
        client={contributing}
        reactionSlug={reviewSlug}
        onBack={(message: string) => {
          reviewSlug = null;
          queueMessage = message;
          loadQueue();
        }}
      />
    {/if}
  {:else if view === "home" && section === "users" && contributing !== undefined}
    <UsersPage client={contributing} />
  {:else if view === "home"}
    <CreateHome
      {files}
      storagePlace={fileStore.storagePlace}
      message={homeMessage}
      {signInNeeded}
      userId={signedInUser?.userId ?? null}
      draftLimitApplies={signedInUser?.siteActions.includes("keepUnlimitedDrafts") !== true}
      {signInProviders}
      onNew={() => {
        homeMessage = "";
        view = "new";
      }}
      onOpen={open}
      onOpenLocal={openLocal}
      onSignIn={signIn}
      onEdit={publishing === undefined ? undefined : editNextVersion}
      onPublishSelected={publishing !== undefined && mayPublish
        ? (slugs: readonly string[]) => publishAndDescribe(slugs, publishing, listFiles)
        : undefined}
    />
  {:else if view === "new" || session === null}
    <div class="row mt">
      <button class="btn sm" onclick={leaveToHome}>← Your mechanisms</button>
      <h2 class="draft-title">New mechanism</h2>
    </div>
    <StageStepper stage="start" draftExists={false} onStage={() => undefined} />
    {#if homeMessage !== ""}
      <p class="small message bad" role="status">{homeMessage}</p>
    {/if}
    <StartStage
      {toolkit}
      document={null}
      apply={() => undefined}
      onCreate={create}
      onNext={() => undefined}
    />
  {:else if preview !== null}
    <div class="row spread mt">
      <span class="pill new">Playing the draft as a learner</span>
      <button
        class="btn sm"
        onclick={() => {
          preview = null;
        }}
      >
        Back to editing
      </button>
    </div>
    <StepPlay
      session={preview}
      update={(next: StepSession) => {
        preview = next;
      }}
      heading={String(currentDraft(session).title)}
      subtitle=""
    />
  {:else}
    {@const current = session}
    <CreateWorkspace
      session={current}
      update={(next: EditorSession) => {
        session = next;
      }}
      {toolkit}
      {lintDraft}
      {saveStatus}
      onHome={leaveToHome}
      onPlay={(stateId: string) => {
        preview = startPreview(currentDraft(current), stateId);
      }}
      onDownload={() => {
        download(current);
      }}
      onPublish={publishing !== undefined && mayPublish
        ? (licenceAgreed: boolean) => {
            void saveAndPublish(current, licenceAgreed);
          }
        : undefined}
      {submitting}
    />
  {/if}
</main>
