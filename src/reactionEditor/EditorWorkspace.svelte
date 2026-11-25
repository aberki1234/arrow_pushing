<script lang="ts">
  // The editing screen: toolbar (save, download, undo/redo, modes, Play as learner), the
  // mechanism panel, the selected state's drawing, and the panels for drawing arrows and for the
  // state. Every decision is in editorSession.ts; this component only passes events on.
  import type { ChemistryToolkit } from "../chemistryToolkit/chemistryToolkit.js";
  import MoleculeCanvas from "../learnerSite/MoleculeCanvas.svelte";
  import { destinationChoice, tappedPlaceOf } from "../learnerSite/stepScreenView.js";
  import type { PickTarget } from "../moleculeDrawing/stateDrawing.js";
  import {
    type ArrowDrawing,
    cancelPick,
    chooseDestination,
  } from "../reactionEditing/arrowDrawing.js";
  import { canRedo, canUndo } from "../reactionEditing/editHistory.js";
  import { previewReadiness } from "../reactionEditing/learnerPreview.js";
  import { statesLeftUnreachable } from "../reactionEditing/stepDeletion.js";
  import AtomHandles from "./AtomHandles.svelte";
  import DrawingControls from "./DrawingControls.svelte";
  import {
    addChange,
    applyStateSmiles,
    currentDraft,
    dragAtom,
    editorRedo,
    editorUndo,
    type EditorMode,
    type EditorSession,
    removeStep,
    selectState,
    setEditorMode,
    tapOnCanvas,
    updateArrowDrawing,
    makeArrowStep,
  } from "./editorSession.js";
  import { draftDrawing, drawnArrowsOn, mappedSmilesOf } from "./editorView.js";
  import MechanismPanel from "./MechanismPanel.svelte";
  import StatePanel from "./StatePanel.svelte";

  const {
    session,
    update,
    toolkit,
    onSave,
    onDownload,
    onPlay,
  }: {
    session: EditorSession;
    update: (next: EditorSession) => void;
    toolkit: ChemistryToolkit | null;
    onSave: () => void;
    onDownload: () => void;
    onPlay: (stateId: string) => void;
  } = $props();

  const MODES: readonly { mode: EditorMode; label: string }[] = [
    { mode: "look", label: "Look" },
    { mode: "drawArrows", label: "Draw arrows" },
    { mode: "moveAtoms", label: "Move atoms" },
    { mode: "showHydrogen", label: "Show H" },
  ];

  const document = $derived(currentDraft(session));
  const shown = $derived(draftDrawing(document, session.selectedStateId));
  const arrows = $derived(drawnArrowsOn(shown.drawing, session.arrowDrawing?.drawnArrows ?? []));
  const choice = $derived(
    session.arrowDrawing === null ? null : destinationChoice(session.arrowDrawing),
  );
  const readiness = $derived(previewReadiness(document));
  const selectedSmiles = $derived(mappedSmilesOf(document, session.selectedStateId));
  let pendingTargetId: string | null = $state(null);

  function pickTarget(target: PickTarget): void {
    const next = tapOnCanvas(session, tappedPlaceOf(target));
    pendingTargetId = next.arrowDrawing?.pendingSource == null ? null : target.pickTargetId;
    update(next);
  }

  function deleteWithConfirm(stepKey: string): void {
    const states = statesLeftUnreachable(document, stepKey);
    const question =
      states.length === 0
        ? `Delete step ${stepKey}?`
        : `Delete step ${stepKey}? These states would go too: ${states.join(", ")}.`;
    if (window.confirm(question)) {
      update(removeStep(session, stepKey));
    }
  }

  function addChangeFromForm(pastedSmiles: string, removedText: string): void {
    if (toolkit === null) {
      return;
    }
    const removedFragmentMapNumbers = removedText
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "")
      .map(Number);
    update(addChange(session, { pastedSmiles, removedFragmentMapNumbers }, toolkit));
  }

  function chooseOption(optionIndex: number): void {
    pendingTargetId = null;
    update(updateArrowDrawing(session, (drawing) => chooseDestination(drawing, optionIndex)));
  }

  function cancelChoice(): void {
    pendingTargetId = null;
    update(updateArrowDrawing(session, cancelPick));
  }

  function selectStateById(stateId: string): void {
    update(selectState(session, stateId));
  }

  function dragAtomBy(mapNumber: number, deltaX: number, deltaY: number): void {
    update(dragAtom(session, mapNumber, { deltaX, deltaY }, shown.pixelsPerUnit));
  }

  function showHydrogenOn(mapNumber: number): void {
    update(tapOnCanvas(session, { placeKind: "atom", mapNumber }));
  }

  function changeDrawing(change: (drawing: ArrowDrawing) => ArrowDrawing): void {
    update(updateArrowDrawing(session, change));
  }

  function makeStep(): void {
    pendingTargetId = null;
    update(makeArrowStep(session));
  }

  function applySmiles(mappedSmiles: string, regenerate: boolean): void {
    update(applyStateSmiles(session, mappedSmiles, regenerate));
  }

  function onWindowKey(event: KeyboardEvent): void {
    const withModifier = event.ctrlKey || event.metaKey;
    if (withModifier && event.key.toLowerCase() === "z") {
      event.preventDefault();
      update(event.shiftKey ? editorRedo(session) : editorUndo(session));
    } else if (event.key === "Escape") {
      pendingTargetId = null;
      update(updateArrowDrawing(session, cancelPick));
    }
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<div class="row spread mt">
  <h1>{String(document.title)}</h1>
  <div class="row">
    <button class="btn sm" onclick={onSave}>Save {session.fileName}</button>
    <button class="btn sm" onclick={onDownload}>Download JSON</button>
    <button
      class="btn sm"
      disabled={!canUndo(session.history)}
      onclick={() => {
        update(editorUndo(session));
      }}
    >
      Undo
    </button>
    <button
      class="btn sm"
      disabled={!canRedo(session.history)}
      onclick={() => {
        update(editorRedo(session));
      }}
    >
      Redo
    </button>
    <button
      class="btn primary sm"
      disabled={!readiness.ready}
      title={readiness.ready ? "Play the draft as a learner would" : readiness.reason}
      onclick={() => {
        onPlay(session.selectedStateId);
      }}
    >
      Play as learner
    </button>
  </div>
</div>
{#if !readiness.ready}
  <p class="small muted">Play as learner: {readiness.reason}</p>
{/if}
{#if session.message.text !== ""}
  <p class={`small message ${session.message.tone}`} role="status">{session.message.text}</p>
{/if}

<div class="editor-layout mt">
  <MechanismPanel
    {document}
    selectedStateId={session.selectedStateId}
    onSelectState={selectStateById}
    onDeleteStep={deleteWithConfirm}
  />
  <section class="card canvas-card" aria-label="Selected state">
    <div class="row" role="toolbar" aria-label="Editing mode">
      {#each MODES as { mode, label } (mode)}
        <button
          class="chip"
          aria-pressed={session.mode === mode}
          onclick={() => {
            update(setEditorMode(session, mode));
          }}
        >
          {label}
        </button>
      {/each}
    </div>
    <MoleculeCanvas
      drawing={shown.drawing}
      {arrows}
      interactive={session.mode === "drawArrows"}
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
  </section>
  <div class="side">
    {#if session.arrowDrawing !== null}
      <DrawingControls
        drawing={session.arrowDrawing}
        onChange={changeDrawing}
        onMakeStep={makeStep}
      />
    {/if}
    <StatePanel
      stateId={session.selectedStateId}
      mappedSmiles={selectedSmiles}
      onApplySmiles={applySmiles}
      onAddChange={addChangeFromForm}
    />
  </div>
</div>
