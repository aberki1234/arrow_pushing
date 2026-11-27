<script lang="ts">
  // The arrows drawn so far, in words, with why a tap was refused, Undo and Clear.
  import {
    type ArrowDrawing,
    clearArrows,
    undoArrow,
  } from "../../reactionEditing/mechanism/arrowDrawing.js";
  import { describeCurvedArrow } from "../../../learner/stepSession/arrowDescriptions.js";

  const {
    drawing,
    onChange,
  }: {
    drawing: ArrowDrawing;
    onChange: (change: (drawing: ArrowDrawing) => ArrowDrawing) => void;
  } = $props();
</script>

{#if drawing.pickMessage !== null}
  <p class="small" role="status">{drawing.pickMessage}</p>
{/if}
{#if drawing.drawnArrows.length === 0}
  <p class="small muted">No arrows yet.</p>
{:else}
  <ul class="arrowlist" aria-label="Arrows drawn">
    {#each drawing.drawnArrows as curvedArrow, position (position)}
      <li>{describeCurvedArrow(curvedArrow)}</li>
    {/each}
  </ul>
{/if}
<div class="row mt">
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
</div>
