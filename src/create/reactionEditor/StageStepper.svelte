<script lang="ts">
  // Create's four stages as a stepper (docs/SPEC.md §5, "Create"): a suggested order, never
  // locked, except that nothing after Start opens before the draft exists.
  import type { CreationStage } from "../reactionEditing/publishing/creationProgress.js";
  import { CREATION_STAGES } from "./createView.js";

  const {
    stage,
    draftExists,
    onStage,
  }: {
    stage: CreationStage;
    draftExists: boolean;
    onStage: (stage: CreationStage) => void;
  } = $props();

  const currentPosition = $derived(CREATION_STAGES.findIndex((entry) => entry.stage === stage));
</script>

<ol class="stepper" aria-label="Stages">
  {#each CREATION_STAGES as entry, position (entry.stage)}
    <li>
      <button
        class:done={position < currentPosition}
        aria-current={entry.stage === stage ? "step" : undefined}
        disabled={!draftExists && entry.stage !== "start"}
        onclick={() => {
          onStage(entry.stage);
        }}
      >
        <span class="n">{position + 1}</span>
        <span><b>{entry.title}</b><small>{entry.subtitle}</small></span>
      </button>
    </li>
  {/each}
</ol>
