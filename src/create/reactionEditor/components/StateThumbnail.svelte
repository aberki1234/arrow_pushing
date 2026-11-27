<script lang="ts">
  // A state drawn small and still: the Start stage's preview, the strip's frames, Teaching's
  // pictures. The learner site's own canvas, with nothing to tap.
  import MoleculeCanvas from "../../../learner/learnerSite/MoleculeCanvas.svelte";
  import type { StateDrawing } from "../../../drawing/moleculeDrawing/stateDrawing.js";

  const { drawing }: { drawing: StateDrawing } = $props();
</script>

<div class="thumbnail" aria-hidden="true">
  <MoleculeCanvas
    {drawing}
    arrows={[]}
    interactive={false}
    selectedTargetId={null}
    onPick={() => undefined}
  />
</div>
