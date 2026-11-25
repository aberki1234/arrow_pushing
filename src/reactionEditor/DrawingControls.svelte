<script lang="ts">
  // While drawing arrows: the arrow type, undo / clear, why a tap was refused, "Make step", and
  // saving the arrows as a misconception, a partial progress message or another arrow set.
  import {
    type ArrowDrawing,
    clearArrows,
    setArrowType,
    undoArrow,
  } from "../reactionEditing/arrowDrawing.js";
  import { describeCurvedArrow } from "../stepSession/arrowDescriptions.js";
  import type { DrawnAnswer } from "./editorSession.js";

  const {
    drawing,
    onChange,
    onMakeStep,
    leavingArrowStepKeys,
    onSaveAs,
  }: {
    drawing: ArrowDrawing;
    onChange: (change: (drawing: ArrowDrawing) => ArrowDrawing) => void;
    onMakeStep: () => void;
    /** The arrow steps leaving the state, for "another arrow set of …". */
    leavingArrowStepKeys: readonly string[];
    onSaveAs: (answer: DrawnAnswer) => void;
  } = $props();

  let answerKind = $state<DrawnAnswer["answerKind"]>("misconception");
  let severity = $state<"wrong" | "plausible">("wrong");
  let feedbackMessage = $state("");
  let misconceptionTag = $state("");
  let chosenStepKey = $state("");
  const stepKey = $derived(
    leavingArrowStepKeys.includes(chosenStepKey) ? chosenStepKey : (leavingArrowStepKeys[0] ?? ""),
  );

  function save(): void {
    if (answerKind === "misconception") {
      onSaveAs({ answerKind, severity, feedbackMessage, misconceptionTag });
    } else if (answerKind === "partialProgress") {
      onSaveAs({ answerKind, feedbackMessage });
    } else {
      onSaveAs({ answerKind, stepKey });
    }
  }
</script>

<section class="card" aria-label="Drawing arrows">
  <h3>Draw the next step</h3>
  <div class="row">
    <button
      class="chip"
      aria-pressed={drawing.arrowType === "pair"}
      onclick={() => {
        onChange((current) => setArrowType(current, "pair"));
      }}
    >
      Pair arrow →
    </button>
    <button
      class="chip"
      aria-pressed={drawing.arrowType === "fishHook"}
      onclick={() => {
        onChange((current) => setArrowType(current, "fishHook"));
      }}
    >
      Fish-hook ⇀
    </button>
  </div>
  {#if drawing.pickMessage !== null}
    <p class="small" role="status">{drawing.pickMessage}</p>
  {/if}
  <ol class="small">
    {#each drawing.drawnArrows as curvedArrow, position (position)}
      <li>{describeCurvedArrow(curvedArrow)}</li>
    {/each}
  </ol>
  <div class="row">
    <button
      class="btn sm"
      disabled={drawing.drawnArrows.length === 0}
      onclick={() => {
        onChange(undoArrow);
      }}
    >
      Undo arrow
    </button>
    <button
      class="btn sm"
      disabled={drawing.drawnArrows.length === 0}
      onclick={() => {
        onChange(clearArrows);
      }}
    >
      Clear
    </button>
    <button class="btn primary sm" disabled={drawing.drawnArrows.length === 0} onclick={onMakeStep}>
      Make step
    </button>
  </div>
  <details class="mt">
    <summary class="small">Save the arrows as…</summary>
    <select aria-label="Save as" bind:value={answerKind}>
      <option value="misconception">a misconception (a wrong answer, with its message)</option>
      <option value="partialProgress">a partial progress message (incomplete arrows)</option>
      <option value="partialArrowSet">another complete arrow set of a step</option>
    </select>
    {#if answerKind === "misconception"}
      <select aria-label="Severity" bind:value={severity}>
        <option value="wrong">wrong</option>
        <option value="plausible">plausible (valid, but not this reaction's route)</option>
      </select>
      <input aria-label="Tag" placeholder="tag (optional)" bind:value={misconceptionTag} />
    {/if}
    {#if answerKind === "partialArrowSet"}
      <select aria-label="Step" bind:value={chosenStepKey}>
        {#each leavingArrowStepKeys as leavingKey (leavingKey)}
          <option value={leavingKey}>{leavingKey}</option>
        {/each}
      </select>
    {:else}
      <textarea aria-label="Message the learner sees" rows="2" bind:value={feedbackMessage}
      ></textarea>
    {/if}
    <button class="btn sm" disabled={drawing.drawnArrows.length === 0} onclick={save}>Save</button>
  </details>
</section>
