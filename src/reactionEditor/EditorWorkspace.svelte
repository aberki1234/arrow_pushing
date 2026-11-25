<script lang="ts">
  // The editing screen: toolbar (save, download, undo/redo, Play as learner), the mechanism
  // panel, the selected state's drawing with the editing modes, and a side panel with tabs for
  // the reaction's, the state's and the step's fields and the live lint. Every decision is in
  // editorSession.ts; this component passes events on, and runs the lint about LINT_DELAY after
  // the last edit (in a worker: workerLinter.ts), dropping answers to drafts since changed.
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
  import { placeOfFinding } from "../reactionEditing/lintPlaces.js";
  import { stepsOf } from "../reactionEditing/reactionDraft.js";
  import { statesLeftUnreachable } from "../reactionEditing/stepDeletion.js";
  import type { LintFinding } from "../reactionLinting/lintFindings.js";
  import AtomHandles from "./AtomHandles.svelte";
  import DrawingControls from "./DrawingControls.svelte";
  import {
    addChange,
    applyDocumentEdit,
    applyStateSmiles,
    currentDraft,
    dragAtom,
    type DrawnAnswer,
    editorRedo,
    editorUndo,
    type EditorMode,
    type EditorSession,
    goToPlace,
    makeArrowStep,
    removeStep,
    saveDrawnArrowsAs,
    selectState,
    selectStep,
    setEditorMode,
    setSideTab,
    type SideTab,
    tapOnCanvas,
    updateArrowDrawing,
  } from "./editorSession.js";
  import { draftDrawing, drawnArrowsOn, mappedSmilesOf } from "./editorView.js";
  import LintPanel from "./LintPanel.svelte";
  import MechanismPanel from "./MechanismPanel.svelte";
  import MisconceptionList from "./MisconceptionList.svelte";
  import ReactionPanel from "./ReactionPanel.svelte";
  import StatePanel from "./StatePanel.svelte";
  import StateTextFields from "./StateTextFields.svelte";
  import StepPanel from "./StepPanel.svelte";
  import type { DraftLinter } from "./workerLinter.js";

  const {
    session,
    update,
    toolkit,
    lintDraft,
    onSave,
    onDownload,
    onPlay,
  }: {
    session: EditorSession;
    update: (next: EditorSession) => void;
    toolkit: ChemistryToolkit | null;
    lintDraft: DraftLinter;
    onSave: () => void;
    onDownload: () => void;
    onPlay: (stateId: string) => void;
  } = $props();

  const LINT_DELAY_MILLISECONDS = 300;
  const MODES: readonly { mode: EditorMode; label: string }[] = [
    { mode: "look", label: "Look" },
    { mode: "drawArrows", label: "Draw arrows" },
    { mode: "moveAtoms", label: "Move atoms" },
    { mode: "showHydrogen", label: "Show H" },
    { mode: "wedges", label: "Wedges" },
  ];

  let pendingTargetId: string | null = $state(null);
  let findings = $state.raw<readonly LintFinding[]>([]);
  let linting = $state(false);
  let lintRun = 0;

  const document = $derived(currentDraft(session));
  const shown = $derived(draftDrawing(document, session.selectedStateId));
  const arrows = $derived(drawnArrowsOn(shown.drawing, session.arrowDrawing?.drawnArrows ?? []));
  const choice = $derived(
    session.arrowDrawing === null ? null : destinationChoice(session.arrowDrawing),
  );
  const readiness = $derived(previewReadiness(document));
  const selectedSmiles = $derived(mappedSmilesOf(document, session.selectedStateId));
  const leavingArrowStepKeys = $derived(
    stepsOf(document)
      .filter((step) => step.fromStateId === session.selectedStateId && step.stepKind !== "change")
      .map((step) => String(step.stepKey)),
  );
  const tabs = $derived<readonly { sideTab: SideTab; label: string }[]>([
    { sideTab: "reaction", label: "Reaction" },
    { sideTab: "state", label: "State" },
    { sideTab: "step", label: "Step" },
    { sideTab: "lint", label: `Lint (${String(findings.length)})` },
  ]);

  $effect(() => {
    const draft = document;
    lintRun += 1;
    const run = lintRun;
    linting = true;
    const timer = setTimeout(() => {
      void lintDraft(draft).then((found) => {
        if (run === lintRun) {
          findings = found;
          linting = false;
        }
      });
    }, LINT_DELAY_MILLISECONDS);
    return () => {
      clearTimeout(timer);
    };
  });

  function apply(edit: Parameters<typeof applyDocumentEdit>[1]): void {
    update(applyDocumentEdit(session, edit));
  }

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
    if (toolkit !== null) {
      const removedFragmentMapNumbers = removedText
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "")
        .map(Number);
      update(addChange(session, { pastedSmiles, removedFragmentMapNumbers }, toolkit));
    }
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

  function selectStepByKey(stepKey: string): void {
    update(selectStep(session, stepKey));
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

  function saveAs(answer: DrawnAnswer): void {
    pendingTargetId = null;
    update(saveDrawnArrowsAs(session, answer));
  }

  function applySmiles(mappedSmiles: string, regenerate: boolean): void {
    update(applyStateSmiles(session, mappedSmiles, regenerate));
  }

  function goToFinding(finding: LintFinding): void {
    update(goToPlace(session, placeOfFinding(document, finding)));
  }

  function onWindowKey(event: KeyboardEvent): void {
    const inField =
      event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    const withModifier = event.ctrlKey || event.metaKey;
    if (withModifier && event.key.toLowerCase() === "z" && !inField) {
      event.preventDefault();
      update(event.shiftKey ? editorRedo(session) : editorUndo(session));
    } else if (event.key === "Escape") {
      cancelChoice();
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
    selectedStepKey={session.selectedStepKey}
    onSelectState={selectStateById}
    onSelectStep={selectStepByKey}
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
    {#if session.arrowDrawing !== null}
      <DrawingControls
        drawing={session.arrowDrawing}
        onChange={changeDrawing}
        onMakeStep={makeStep}
        {leavingArrowStepKeys}
        onSaveAs={saveAs}
      />
    {/if}
  </section>
  <div class="side">
    <div class="row" role="tablist" aria-label="Fields">
      {#each tabs as { sideTab, label } (sideTab)}
        <button
          class="chip"
          role="tab"
          aria-selected={session.sideTab === sideTab}
          disabled={sideTab === "step" && session.selectedStepKey === null}
          onclick={() => {
            update(setSideTab(session, sideTab));
          }}
        >
          {label}
        </button>
      {/each}
    </div>
    {#if session.sideTab === "reaction"}
      <ReactionPanel {document} {apply} />
    {:else if session.sideTab === "step" && session.selectedStepKey !== null}
      <StepPanel {document} stepKey={session.selectedStepKey} {apply} />
    {:else if session.sideTab === "lint"}
      <LintPanel {findings} {linting} onGoTo={goToFinding} />
    {:else}
      <section class="card" aria-label="State fields">
        <h3>State {session.selectedStateId}</h3>
        <StateTextFields {document} stateId={session.selectedStateId} {apply} />
        <MisconceptionList {document} stateId={session.selectedStateId} {apply} />
      </section>
      <StatePanel
        stateId={session.selectedStateId}
        mappedSmiles={selectedSmiles}
        onApplySmiles={applySmiles}
        onAddChange={addChangeFromForm}
      />
    {/if}
  </div>
</div>
