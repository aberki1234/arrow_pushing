<script lang="ts">
  // The row of state thumbnails under the Mechanism stage's drawing (docs/SPEC.md §5, "Create"):
  // the route, then each branch from the state it leaves to the state it joins
  // (reactionEditing/stateStrip.ts). A state shows on the drawing; a step shows its fields.
  import type { ReactionDocument } from "../reactionEditing/reactionDraft.js";
  import { stateDisplayNames, stateStripRows } from "../reactionEditing/stateStrip.js";
  import { stepsOf } from "../reactionEditing/reactionDraft.js";
  import { draftDrawing } from "./editorView.js";
  import StateThumbnail from "./StateThumbnail.svelte";

  const {
    document,
    selectedStateId,
    selectedStepKey,
    onSelectState,
    onSelectStep,
  }: {
    document: ReactionDocument;
    selectedStateId: string;
    selectedStepKey: string | null;
    onSelectState: (stateId: string) => void;
    onSelectStep: (stepKey: string) => void;
  } = $props();

  const rows = $derived(stateStripRows(document));
  const names = $derived(stateDisplayNames(document));
  const nameOf = (stateId: string | null): string =>
    stateId === null ? "" : (names.get(stateId) ?? stateId);

  function stepLabel(stepKey: string): string {
    const step = stepsOf(document).find((candidate) => candidate.stepKey === stepKey);
    return `Step ${nameOf(String(step?.fromStateId))} → ${nameOf(String(step?.toStateId))}`;
  }
</script>

<div class="strips" aria-label="States of the mechanism" role="group">
  {#each rows as row, position (position)}
    <div class="strip" style={`margin-left: ${String(row.depth * 24)}px`}>
      {#if row.rowKind === "branch"}
        <span class="small muted">⑂ from {nameOf(row.leavesStateId)}</span>
      {:else if row.rowKind === "unconnected"}
        <span class="small message bad">Not reached:</span>
      {/if}
      {#each row.frames as frame (frame.frameKind === "state" ? frame.stateId : frame.stepKey)}
        {#if frame.frameKind === "state"}
          <button
            class="frame"
            aria-current={!selectedStepKey && frame.stateId === selectedStateId}
            aria-label={`Show ${nameOf(frame.stateId)}`}
            onclick={() => {
              onSelectState(frame.stateId);
            }}
          >
            <StateThumbnail drawing={draftDrawing(document, frame.stateId).drawing} />
            {nameOf(frame.stateId)}
          </button>
        {:else}
          <button
            class="to"
            aria-current={frame.stepKey === selectedStepKey}
            aria-label={stepLabel(frame.stepKey)}
            title={frame.stepKind === "change" ? "Molecules change" : "A step"}
            onclick={() => {
              onSelectStep(frame.stepKey);
            }}
          >
            {frame.stepKind === "change" ? "+" : "→"}
          </button>
        {/if}
      {/each}
      {#if row.joinsStateId !== null}
        <span class="small muted">joins {nameOf(row.joinsStateId)}</span>
      {/if}
    </div>
  {/each}
</div>
