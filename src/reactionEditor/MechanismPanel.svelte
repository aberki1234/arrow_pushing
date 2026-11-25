<script lang="ts">
  // The mechanism as a list (reactionEditing/mechanismOutline.ts): states to select, steps with
  // a delete button, branches indented, "joins …" where a branch rejoins.
  import { mechanismOutline } from "../reactionEditing/mechanismOutline.js";
  import type { ReactionDocument } from "../reactionEditing/reactionDraft.js";
  import { outlineRowText } from "./editorView.js";

  const {
    document,
    selectedStateId,
    selectedStepKey,
    onSelectState,
    onSelectStep,
    onDeleteStep,
  }: {
    document: ReactionDocument;
    selectedStateId: string;
    selectedStepKey: string | null;
    onSelectState: (stateId: string) => void;
    onSelectStep: (stepKey: string) => void;
    onDeleteStep: (stepKey: string) => void;
  } = $props();

  const INDENT_PIXELS = 18;
  const rows = $derived(mechanismOutline(document));
</script>

<nav class="card mechanism" aria-label="Mechanism">
  <h3>Mechanism</h3>
  <ol class="outline">
    {#each rows as row, position (position)}
      <li
        style:padding-left={`${String(row.depth * INDENT_PIXELS)}px`}
        class={`row-${row.rowKind}`}
      >
        {#if row.rowKind === "state"}
          <button
            class="chip"
            aria-pressed={row.stateId === selectedStateId}
            onclick={() => {
              onSelectState(row.stateId);
            }}
          >
            {outlineRowText(row, document)}
          </button>
        {:else if row.rowKind === "step"}
          <button
            class="chip small"
            aria-pressed={row.stepKey === selectedStepKey}
            onclick={() => {
              onSelectStep(row.stepKey);
            }}
          >
            ↓ {outlineRowText(row, document)}
          </button>
          <button
            class="btn sm"
            aria-label={`Delete step ${row.stepKey}`}
            onclick={() => {
              onDeleteStep(row.stepKey);
            }}
          >
            ✕
          </button>
        {:else}
          <span class="small muted">↪ {outlineRowText(row, document)}</span>
        {/if}
      </li>
    {/each}
  </ol>
</nav>
