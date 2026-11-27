<script lang="ts">
  // Teaching's "Common wrong answers": draw a mistake learners make on the state, then write what
  // to tell them and how wrong it is (drawnAnswers.ts saves it as the exact pattern). Incomplete
  // but right arrows can get a "right so far" message instead. The saved ones are listed below.
  import type { ArrowDrawing } from "../reactionEditing/mechanism/arrowDrawing.js";
  import ArrowList from "./ArrowList.svelte";
  import DrawingCanvas from "./DrawingCanvas.svelte";
  import {
    applyDocumentEdit,
    currentDraft,
    type DocumentEdit,
    type EditorSession,
    saveDrawnArrowsAs,
    updateArrowDrawing,
  } from "./editorSession.js";
  import MisconceptionList from "./MisconceptionList.svelte";

  const { session, update }: { session: EditorSession; update: (next: EditorSession) => void } =
    $props();

  let feedbackMessage = $state("");
  let severity = $state<"wrong" | "plausible">("wrong");
  const drawnCount = $derived(session.arrowDrawing?.drawnArrows.length ?? 0);

  function save(answerKind: "misconception" | "partialProgress"): void {
    const next =
      answerKind === "misconception"
        ? saveDrawnArrowsAs(session, { answerKind, severity, feedbackMessage })
        : saveDrawnArrowsAs(session, { answerKind, feedbackMessage });
    if (next.message.tone === "good") {
      feedbackMessage = "";
    }
    update(next);
  }

  function applyEdit(edit: DocumentEdit): void {
    update(applyDocumentEdit(session, edit));
  }
</script>

<p class="small muted">
  Draw a mistake learners make, then write what you'd tell them. Mistakes you don't list still get
  the general feedback (wrong electron count, reversed arrow, …).
</p>
<div class="grid g2">
  <div class="card flat">
    <DrawingCanvas {session} {update} />
    {#if session.arrowDrawing !== null}
      <ArrowList
        drawing={session.arrowDrawing}
        onChange={(change: (drawing: ArrowDrawing) => ArrowDrawing) => {
          update(updateArrowDrawing(session, change));
        }}
      />
    {/if}
  </div>
  <div>
    <label class="f" for="wrong-message">What to tell the learner</label>
    <textarea id="wrong-message" data-field="misconceptions" rows="4" bind:value={feedbackMessage}
    ></textarea>
    <p class="f">How wrong is it?</p>
    <div class="seg" role="group" aria-label="How wrong">
      <button
        aria-pressed={severity === "wrong"}
        onclick={() => {
          severity = "wrong";
        }}
      >
        Wrong
      </button>
      <button
        aria-pressed={severity === "plausible"}
        onclick={() => {
          severity = "plausible";
        }}
      >
        Plausible, not this reaction
      </button>
    </div>
    <div class="row mt">
      <button
        class="btn primary sm"
        disabled={drawnCount === 0 || feedbackMessage.trim() === ""}
        onclick={() => {
          save("misconception");
        }}
      >
        Save this wrong answer
      </button>
      <button
        class="btn sm"
        disabled={drawnCount === 0 || feedbackMessage.trim() === ""}
        title="For correct but incomplete arrows"
        onclick={() => {
          save("partialProgress");
        }}
      >
        Save as "right so far"
      </button>
    </div>
  </div>
</div>
<MisconceptionList
  document={currentDraft(session)}
  stateId={session.selectedStateId}
  apply={applyEdit}
/>
