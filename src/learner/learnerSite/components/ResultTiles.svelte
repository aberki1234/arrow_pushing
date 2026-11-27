<script lang="ts">
  // A finished run's result (item 11): one tile per step taken, ✓ first try, ~ after a retry or
  // a hint, ✕ missed, in colour and shape. Used wherever a result is shown, instead of the
  // coloured-square text.
  import type { StepOutcome, StepResult } from "../../stepSession/stepSession.js";

  const { stepResults, small = false }: { stepResults: readonly StepResult[]; small?: boolean } =
    $props();

  const OUTCOME_TO_TILE: Readonly<
    Record<StepOutcome, { tileClass: string; glyph: string; name: string }>
  > = {
    firstTry: { tileClass: "g", glyph: "✓", name: "first try" },
    afterRetry: { tileClass: "y", glyph: "~", name: "after a retry" },
    afterHint: { tileClass: "y", glyph: "~", name: "after a hint" },
    missed: { tileClass: "r", glyph: "✕", name: "missed" },
  };
</script>

<ol class="row mini-tiles result-tiles" class:small aria-label="Steps">
  {#each stepResults as stepResult, position (position)}
    {@const tile = OUTCOME_TO_TILE[stepResult.stepOutcome]}
    <li class={`tile ${tile.tileClass}`} aria-label={`Step ${String(position + 1)}: ${tile.name}`}>
      {tile.glyph}
    </li>
  {/each}
</ol>
