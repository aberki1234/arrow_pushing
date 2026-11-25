<script lang="ts">
  // The editor page: the start panel until a draft is open, then the editing screen; "Play as
  // learner" shows the learner's own step screen (learnerSite/StepPlay.svelte) on the draft.
  import { onMount } from "svelte";
  import type { ChemistryToolkit } from "../chemistryToolkit/chemistryToolkit.js";
  import StepPlay from "../learnerSite/StepPlay.svelte";
  import { startPreview } from "../reactionEditing/learnerPreview.js";
  import type { StepSession } from "../stepSession/stepSession.js";
  import { createdDraft } from "./draftCreation.js";
  import { currentDraft, type EditorSession, openDraft } from "./editorSession.js";
  import EditorWorkspace from "./EditorWorkspace.svelte";
  import type { ListedReactionFile, ReactionFileStore } from "./reactionFileStore.js";
  import StartPanel from "./StartPanel.svelte";

  const {
    toolkitLoading,
    fileStore,
  }: {
    toolkitLoading: Promise<ChemistryToolkit>;
    fileStore: ReactionFileStore;
  } = $props();

  let toolkit = $state.raw<ChemistryToolkit | null>(null);
  let files = $state.raw<ListedReactionFile[] | null>(null);
  // Raw state: sessions are never changed in place, and deep proxies would break structuredClone.
  let session = $state.raw<EditorSession | null>(null);
  let preview = $state.raw<StepSession | null>(null);
  let startMessage = $state("");

  onMount(() => {
    void toolkitLoading.then((loaded) => {
      toolkit = loaded;
    });
    fileStore.list().then(
      (listed) => {
        files = listed;
      },
      () => {
        files = null;
      },
    );
  });

  function reasonOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  function open(fileName: string): void {
    fileStore.read(fileName).then(
      (document) => {
        session = openDraft(document, fileName);
      },
      (error: unknown) => {
        startMessage = reasonOf(error);
      },
    );
  }

  function openLocal(file: File): void {
    file.text().then(
      (text) => {
        session = openDraft(JSON.parse(text) as Record<string, unknown>, file.name);
      },
      (error: unknown) => {
        startMessage = reasonOf(error);
      },
    );
  }

  function create(reactionSlug: string, title: string, pastedSmiles: string): void {
    if (toolkit === null) {
      return;
    }
    const creation = createdDraft({ reactionSlug, title, pastedSmiles }, toolkit);
    if (creation.outcome === "refused") {
      startMessage = creation.reason;
    } else {
      session = openDraft(creation.document, `${reactionSlug}.json`);
    }
  }

  function save(current: EditorSession): void {
    fileStore.save(current.fileName, currentDraft(current)).then(
      () => {
        session = {
          ...current,
          message: { tone: "good", text: `Saved content/reactions/${current.fileName}.` },
        };
      },
      (error: unknown) => {
        session = { ...current, message: { tone: "bad", text: `Not saved: ${reasonOf(error)}` } };
      },
    );
  }

  function updatePreview(next: StepSession): void {
    preview = next;
  }

  function updateSession(next: EditorSession): void {
    session = next;
  }

  function play(stateId: string): void {
    if (session !== null) {
      preview = startPreview(currentDraft(session), stateId);
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

<main class="wrap">
  {#if session === null}
    <StartPanel
      {files}
      message={startMessage}
      toolkitReady={toolkit !== null}
      onOpen={open}
      onCreate={create}
      onOpenLocal={openLocal}
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
      update={updatePreview}
      heading={String(currentDraft(session).title)}
      subtitle=""
    />
  {:else}
    {@const current = session}
    <EditorWorkspace
      session={current}
      update={updateSession}
      {toolkit}
      onSave={() => {
        save(current);
      }}
      onDownload={() => {
        download(current);
      }}
      onPlay={play}
    />
  {/if}
</main>
