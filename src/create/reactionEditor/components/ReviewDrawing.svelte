<script lang="ts">
  // One state of a version drawn small for the review screen, with a wrong answer's arrows when
  // its pattern is exact (editorView.patternArrowsOn). A state that cannot be drawn says so.
  import MoleculeCanvas from "../../../learner/learnerSite/MoleculeCanvas.svelte";
  import type { ReactionDocument } from "../../reactionEditing/draft/reactionDraft.js";
  import { draftDrawing, patternArrowsOn } from "../model/editorView.js";

  const {
    document,
    stateId,
    arrowPattern = "",
    caption,
  }: {
    document: ReactionDocument;
    stateId: string;
    arrowPattern?: string;
    caption: string;
  } = $props();

  const drawn = $derived.by(() => {
    try {
      const { drawing } = draftDrawing(document, stateId);
      return { drawing, arrows: patternArrowsOn(drawing, arrowPattern) };
    } catch {
      return null;
    }
  });
</script>

<div class="card flat">
  <div class="cap">{caption}</div>
  {#if drawn === null}
    <p class="small muted">This state cannot be drawn.</p>
  {:else}
    <div class="thumbnail" aria-hidden="true">
      <MoleculeCanvas
        drawing={drawn.drawing}
        arrows={drawn.arrows}
        interactive={false}
        selectedTargetId={null}
        onPick={() => undefined}
      />
    </div>
  {/if}
</div>
