<script lang="ts">
  // Create (docs/SPEC.md §5, "Create"): Your mechanisms, then a new mechanism's Start stage or a
  // draft open in its stages (CreateWorkspace.svelte); "Play as learner" shows the learner's own
  // step screen (learnerSite/StepPlay.svelte) on the draft. A draft is saved by itself about
  // autosaveDelayMilliseconds after the last edit (on the server, or in content/reactions/).
  import { onMount } from "svelte";
  import type { ChemistryToolkit } from "../chemistryToolkit/chemistryToolkit.js";
  import StepPlay from "../learnerSite/StepPlay.svelte";
  import type { ReactionDocument } from "../reactionEditing/reactionDraft.js";
  import { startPreview } from "../reactionEditing/learnerPreview.js";
  import type { StepSession } from "../stepSession/stepSession.js";
  import SiteHeader from "../learnerSite/SiteHeader.svelte";
  import { navigationTabs } from "../learnerSite/siteNavigation.js";
  import CreateHome from "./CreateHome.svelte";
  import CreateWorkspace from "./CreateWorkspace.svelte";
  import { createdDraft, type DraftStart } from "./draftCreation.js";
  import { currentDraft, type EditorSession, openDraft } from "./editorSession.js";
  import type { ListedReactionFile, ReactionFileStore } from "./reactionFileStore.js";
  import {
    publishOutcomeMessage,
    type ReactionPublishing,
    type SignedInUser,
    slugOfFileName,
  } from "./serverReactionStore.js";
  import StageStepper from "./StageStepper.svelte";
  import StartStage from "./StartStage.svelte";
  import type { DraftLinter } from "./workerLinter.js";

  const {
    toolkitLoading,
    fileStore,
    lintDraft,
    publishing,
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

  const mayPublish = $derived(signedInUser?.siteActions.includes("publish") === true);

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
      }
    });
  });

  function reasonOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  function showDraft(document: ReactionDocument, fileName: string): void {
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
    view = "draft";
  }

  async function save(current: EditorSession): Promise<void> {
    const savedDraft = currentDraft(current);
    saveStatus = "Saving…";
    try {
      await fileStore.save(current.fileName, savedDraft);
      lastSavedDraft = savedDraft;
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
      if (session !== null) {
        void save(session);
      }
    }, autosaveDelayMilliseconds);
    return () => {
      clearTimeout(timer);
    };
  });

  function signIn(): void {
    publishing?.signInAddress().then(goToAddress, (error: unknown) => {
      homeMessage = reasonOf(error);
    });
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
/>
<main class="wrap">
  {#if view === "home"}
    <CreateHome
      {files}
      storagePlace={fileStore.storagePlace}
      message={homeMessage}
      {signInNeeded}
      onNew={() => {
        homeMessage = "";
        view = "new";
      }}
      onOpen={open}
      onOpenLocal={openLocal}
      onSignIn={signIn}
      onEdit={publishing === undefined ? undefined : editNextVersion}
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
    />
  {/if}
</main>
