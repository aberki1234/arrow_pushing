<script lang="ts">
  // The selected state's drawing, where the author works: arrows are picked in drawArrows mode
  // (the "which atom forms the bond?" menu included), atoms dragged or given an H, bonds' wedges
  // cycled. Every decision is in editorSession.ts; this passes the taps on.
  import MoleculeCanvas from "../learnerSite/MoleculeCanvas.svelte";
  import { destinationChoice, tappedPlaceOf } from "../learnerSite/stepScreenView.js";
  import type { PickTarget } from "../moleculeDrawing/stateDrawing.js";
  import { cancelPick, chooseDestination } from "../reactionEditing/arrowDrawing.js";
  import AtomHandles from "./AtomHandles.svelte";
  import {
    currentDraft,
    dragAtom,
    type EditorSession,
    tapOnCanvas,
    updateArrowDrawing,
  } from "./editorSession.js";
  import { draftDrawing, drawnArrowsOn } from "./editorView.js";

  const { session, update }: { session: EditorSession; update: (next: EditorSession) => void } =
    $props();

  let pendingTargetId: string | null = $state(null);

  const shown = $derived(draftDrawing(currentDraft(session), session.selectedStateId));
  const arrows = $derived(drawnArrowsOn(shown.drawing, session.arrowDrawing?.drawnArrows ?? []));
  const choice = $derived(
    session.arrowDrawing === null ? null : destinationChoice(session.arrowDrawing),
  );

  function pickTarget(target: PickTarget): void {
    const next = tapOnCanvas(session, tappedPlaceOf(target));
    pendingTargetId = next.arrowDrawing?.pendingSource == null ? null : target.pickTargetId;
    update(next);
  }

  function chooseOption(optionIndex: number): void {
    pendingTargetId = null;
    update(updateArrowDrawing(session, (drawing) => chooseDestination(drawing, optionIndex)));
  }

  function cancelChoice(): void {
    pendingTargetId = null;
    update(updateArrowDrawing(session, cancelPick));
  }

  function cancelOnEscape(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      cancelChoice();
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
  {choice}
  onPick={pickTarget}
  onChoose={chooseOption}
  onCancelChoice={cancelChoice}
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
