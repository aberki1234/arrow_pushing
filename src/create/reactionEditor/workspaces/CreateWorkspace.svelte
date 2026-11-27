<script lang="ts">
  // A draft open in Create (docs/SPEC.md §5, "Create"): the top row (back to Your mechanisms, the
  // name, whether it is saved, undo and redo, Play as learner), the stage stepper, and the stage
  // on screen. Lint runs about LINT_DELAY after the last edit, in a worker (workerLinter.ts),
  // dropping answers to drafts since changed; Teaching and Publish show its findings.
  import { tick } from "svelte";
  import type { ChemistryToolkit } from "../../../tooling/chemistryToolkit/chemistryToolkit.js";
  import type { CreationStage } from "../../reactionEditing/publishing/creationProgress.js";
  import { canRedo, canUndo } from "../../reactionEditing/mechanism/editHistory.js";
  import { previewReadiness } from "../../reactionEditing/publishing/learnerPreview.js";
  import type { LintFinding } from "../../../tooling/reactionLinting/findings/lintFindings.js";
  import {
    applyDocumentEdit,
    currentDraft,
    type DocumentEdit,
    editorRedo,
    editorUndo,
    type EditorSession,
    setStage,
  } from "../model/editorSession.js";
  import { showField } from "../io/fieldFocus.js";
  import MechanismStage from "./MechanismStage.svelte";
  import PublishStage from "./PublishStage.svelte";
  import type { SubmitControls } from "../model/reviewView.js";
  import StageStepper from "../components/StageStepper.svelte";
  import StartStage from "./StartStage.svelte";
  import TeachingStage from "./TeachingStage.svelte";
  import type { DraftLinter } from "../io/workerLinter.js";

  const {
    session,
    update,
    toolkit,
    lintDraft,
    saveStatus,
    onHome,
    onPlay,
    onDownload,
    onPublish,
    submitting,
  }: {
    session: EditorSession;
    update: (next: EditorSession) => void;
    toolkit: ChemistryToolkit | null;
    lintDraft: DraftLinter;
    /** "Saved", "Saving…", "Not saved: …". */
    saveStatus: string;
    onHome: () => void;
    onPlay: (stateId: string) => void;
    onDownload: () => void;
    onPublish?: ((licenceAgreed: boolean) => void) | undefined;
    submitting?: SubmitControls | undefined;
  } = $props();

  const LINT_DELAY_MILLISECONDS = 300;

  let shownRequestNumber = 0;
  // A check asked for a field: show it once the stage it is on has been drawn. Two ticks: a
  // stage may open a panel (⋯ More) for it in its own effect first.
  $effect(() => {
    const request = session.focusRequest;
    if (request === null || request.requestNumber === shownRequestNumber) {
      return;
    }
    shownRequestNumber = request.requestNumber;
    void tick()
      .then(tick)
      .then(() => showField(window.document, request.field));
  });

  let findings = $state.raw<readonly LintFinding[]>([]);
  let linting = $state(true);
  let lintRun = 0;

  const document = $derived(currentDraft(session));
  const readiness = $derived(previewReadiness(document));

  $effect(() => {
    const draft = document;
    lintRun += 1;
    const run = lintRun;
    linting = true;
    const timer = setTimeout(() => {
      void lintDraft(draft).then((found) => {
        if (run === lintRun) {
          findings = found;
          linting = false;
        }
      });
    }, LINT_DELAY_MILLISECONDS);
    return () => {
      clearTimeout(timer);
    };
  });

  function showStage(stage: CreationStage): void {
    update(setStage(session, stage));
  }

  function apply(edit: DocumentEdit): void {
    update(applyDocumentEdit(session, edit));
  }

  function onWindowKey(event: KeyboardEvent): void {
    const inField =
      event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    const withModifier = event.ctrlKey || event.metaKey;
    if (withModifier && event.key.toLowerCase() === "z" && !inField) {
      event.preventDefault();
      update(event.shiftKey ? editorRedo(session) : editorUndo(session));
    }
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<div class="row spread mt">
  <div class="row">
    <button class="btn sm" onclick={onHome}>← Your mechanisms</button>
    <h2 class="draft-title">{String(document.title)}</h2>
    <span class="pill" aria-live="polite">{saveStatus}</span>
  </div>
  <div class="row">
    <button
      class="btn sm"
      aria-label="Undo"
      disabled={!canUndo(session.history)}
      onclick={() => {
        update(editorUndo(session));
      }}
    >
      ↶
    </button>
    <button
      class="btn sm"
      aria-label="Redo"
      disabled={!canRedo(session.history)}
      onclick={() => {
        update(editorRedo(session));
      }}
    >
      ↷
    </button>
    <button
      class="btn sm"
      disabled={!readiness.ready}
      title={readiness.ready ? "Play the draft as a learner would" : readiness.reason}
      onclick={() => {
        onPlay(session.selectedStateId);
      }}
    >
      ▶ Play as learner
    </button>
  </div>
</div>
<StageStepper stage={session.stage} draftExists={true} onStage={showStage} />
{#if session.message.text !== ""}
  <p class={`small message ${session.message.tone}`} role="status">{session.message.text}</p>
{/if}

{#if session.stage === "start"}
  <StartStage
    {toolkit}
    {document}
    {apply}
    onCreate={() => undefined}
    onNext={() => {
      update(setStage(session, "mechanism"));
    }}
  />
{:else if session.stage === "mechanism"}
  <MechanismStage {session} {update} {toolkit} />
{:else if session.stage === "teaching"}
  <TeachingStage {session} {update} {findings} />
{:else}
  <PublishStage
    {session}
    {update}
    {findings}
    {linting}
    {onPlay}
    {onDownload}
    {onPublish}
    {submitting}
  />
{/if}
