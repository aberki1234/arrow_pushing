<script lang="ts">
  // The selected state's drawing, where the author works: arrows are picked in drawArrows mode
  // (point and snap, as for learners: new bonds are pointed at as dashed lines), atoms dragged or
  // given an H, bonds' wedges cycled. Every decision is in editorSession.ts; this passes the taps
  // on.
  import MoleculeCanvas from "../../../learner/learnerSite/MoleculeCanvas.svelte";
  import { tappedPlaceOf } from "../../../learner/learnerSite/stepScreenView.js";
  import type { PickTarget } from "../../../drawing/moleculeDrawing/stateDrawing.js";
  import { cancelPick } from "../../reactionEditing/mechanism/arrowDrawing.js";
  import { destinationTargets } from "../../../learner/stepSession/destinationTargets.js";
  import AtomHandles from "./AtomHandles.svelte";
  import {
    currentDraft,
    dragAtom,
    type EditorSession,
    tapOnCanvas,
    updateArrowDrawing,
  } from "../model/editorSession.js";
  import { draftDrawing, drawnArrowsOn } from "../model/editorView.js";

  const { session, update }: { session: EditorSession; update: (next: EditorSession) => void } =
    $props();

  let pendingTargetId: string | null = $state(null);

  const shown = $derived(draftDrawing(currentDraft(session), session.selectedStateId));
  const arrows = $derived(drawnArrowsOn(shown.drawing, session.arrowDrawing?.drawnArrows ?? []));
  const destinations = $derived.by(() => {
    const drawing = session.arrowDrawing;
    if (session.mode !== "drawArrows" || drawing === null || drawing.pendingSource === null) {
      return null;
    }
    return destinationTargets(shown.drawing, drawing.graph, {
      source: drawing.pendingSource,
      arrowType: drawing.arrowType,
      drawnArrows: drawing.drawnArrows,
    });
  });

  function pickTarget(target: PickTarget): void {
    const next = tapOnCanvas(session, tappedPlaceOf(target));
    pendingTargetId = next.arrowDrawing?.pendingSource == null ? null : target.pickTargetId;
    update(next);
  }

  function cancelPicking(): void {
    pendingTargetId = null;
    update(updateArrowDrawing(session, cancelPick));
  }

  function cancelOnEscape(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      cancelPicking();
    }
  }

  function dragAtomBy(mapNumber: number, deltaX: number, deltaY: number): void {
    update(dragAtom(session, mapNumber, { deltaX, deltaY }, shown.pixelsPerUnit));
  }

  function showHydrogenOn(mapNumber: number): void {
    update(tapOnCanvas(session, { placeKind: "atom", mapNumber }));
  }

  $effect(() => {
    // A new drawing (a step made, another state) has no pending source.
    if (session.arrowDrawing?.pendingSource == null) {
      pendingTargetId = null;
    }
  });
</script>

<svelte:window onkeydown={cancelOnEscape} />

<MoleculeCanvas
  drawing={shown.drawing}
  {arrows}
  interactive={session.mode === "drawArrows" || session.mode === "wedges"}
  selectedTargetId={pendingTargetId}
  {destinations}
  onPick={pickTarget}
>
  {#snippet overlay()}
    {#if session.mode === "moveAtoms" || session.mode === "showHydrogen"}
      <AtomHandles
        drawing={shown.drawing}
        handleMode={session.mode === "moveAtoms" ? "drag" : "pick"}
        onDragged={dragAtomBy}
        onPicked={showHydrogenOn}
      />
    {/if}
  {/snippet}
</MoleculeCanvas>
