<script lang="ts">
  // While drawing arrows: the arrow type, undo / clear, why a tap was refused, and "Make step".
  import {
    type ArrowDrawing,
    clearArrows,
    setArrowType,
    undoArrow,
  } from "../reactionEditing/arrowDrawing.js";
  import { describeCurvedArrow } from "../stepSession/arrowDescriptions.js";

  const {
    drawing,
    onChange,
    onMakeStep,
  }: {
    drawing: ArrowDrawing;
    onChange: (change: (drawing: ArrowDrawing) => ArrowDrawing) => void;
    onMakeStep: () => void;
  } = $props();
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
</section>
