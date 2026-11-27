<script lang="ts">
  // One tile per arrow step: ✓ first try, ~ with help, the current step, steps ahead.
  import type { StepSession } from "../stepSession/stepSession.js";
  import { type StepTileKind, stepTiles } from "./stepScreenView.js";

  const { session }: { session: StepSession } = $props();

  const TILE_KIND_TO_CLASS: Readonly<Record<StepTileKind, string>> = {
    firstTry: "g",
    helped: "y",
    missed: "r",
    current: "current",
    ahead: "e",
  };
</script>

<ol class="row mini-tiles" aria-label="Steps" style="list-style:none;margin:0;padding:0">
  {#each stepTiles(session) as tile, position (position)}
    <li class={`tile ${TILE_KIND_TO_CLASS[tile.stepTileKind]}`} aria-label={tile.accessibleName}>
      {tile.tileText}
    </li>
  {/each}
</ol>
