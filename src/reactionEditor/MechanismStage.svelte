<script lang="ts">
  // Create's Mechanism stage (docs/SPEC.md §5, "Create", stage 2): the drawing with Arrow,
  // Fish-hook, Move atoms and ⋯ More; the row of state thumbnails; and beside them either the new
  // step being drawn ("Make the step") or the selected step's card.
  import type { ChemistryToolkit } from "../chemistryToolkit/chemistryToolkit.js";
  import { type ArrowDrawing, setArrowType } from "../reactionEditing/arrowDrawing.js";
  import type { WedgeStyleChoice } from "../reactionEditing/fieldEdits.js";
  import { stateDisplayNames } from "../reactionEditing/stateStrip.js";
  import { statesLeftUnreachable } from "../reactionEditing/stepDeletion.js";
  import ArrowList from "./ArrowList.svelte";
  import type { MorePanelKind } from "./createView.js";
  import DrawingCanvas from "./DrawingCanvas.svelte";
  import {
    addChange,
    applyDocumentEdit,
    applyStateSmiles,
    currentDraft,
    type EditorMode,
    type EditorSession,
    makeArrowStep,
    removeStep,
    saveDrawnArrowsAs,
    selectState,
    selectStep,
    setEditorMode,
    setWedgeStyle,
    updateArrowDrawing,
  } from "./editorSession.js";
  import { mappedSmilesOf } from "./editorView.js";
  import MorePanel from "./MorePanel.svelte";
  import StateAdvanced from "./StateAdvanced.svelte";
  import StateStrip from "./StateStrip.svelte";
  import StepCard from "./StepCard.svelte";

  const {
    session,
    update,
    toolkit,
  }: {
    session: EditorSession;
    update: (next: EditorSession) => void;
    toolkit: ChemistryToolkit | null;
  } = $props();

  const WEDGE_STYLES: readonly { style: WedgeStyleChoice; label: string }[] = [
    { style: "wedge", label: "▶ Wedge" },
    { style: "dash", label: "⋯ Dash" },
    { style: "plain", label: "— Plain" },
  ];
  const MORE_ITEMS: readonly { label: string; hint: string; choose: () => void }[] = [
    {
      label: "Show an H",
      hint: "make one hydrogen tappable",
      choose: () => {
        setMode("showHydrogen");
      },
    },
    {
      label: "Add a molecule",
      hint: "a reagent arrives (a change step)",
      choose: () => {
        open("addMolecule");
      },
    },
    {
      label: "Wedges and dashes",
      hint: "choose a style, then tap a bond",
      choose: () => {
        setMode("wedges");
      },
    },
    {
      label: "Shorten a group (Ph, tBu)",
      hint: "draw a bystander as its label",
      choose: () => {
        open("shortenGroup");
      },
    },
    {
      label: "Edit as SMILES",
      hint: "for experts; can regenerate after",
      choose: () => {
        open("editSmiles");
      },
    },
  ];

  const HOW_IT_WORKS =
    "The site applies your arrows and draws the next state. Arrows that break the chemistry " +
    "are refused straight away, with the reason. A result identical to a state you already " +
    "have joins it.";

  let moreOpen = $state(false);
  let panelKind = $state<MorePanelKind | null>(null);

  // A check about a group or a state's SMILES opens the panel that edits it.
  $effect(() => {
    const field = session.focusRequest?.field;
    if (field === "abbreviatedGroups") {
      panelKind = "shortenGroup";
    } else if (field === "mappedSmiles") {
      panelKind = "editSmiles";
    }
  });

  const document = $derived(currentDraft(session));
  const names = $derived(stateDisplayNames(document));
  const selectedName = $derived(names.get(session.selectedStateId) ?? session.selectedStateId);
  const drawing = $derived(session.arrowDrawing);
  const arrowType = $derived(drawing?.arrowType ?? "pair");

  function setMode(mode: EditorMode): void {
    moreOpen = false;
    update(setEditorMode(session, mode));
  }

  function open(kind: MorePanelKind): void {
    moreOpen = false;
    panelKind = kind;
  }

  function drawWith(type: ArrowDrawing["arrowType"]): void {
    const drawingSession =
      session.mode === "drawArrows" ? session : setEditorMode(session, "drawArrows");
    update(updateArrowDrawing(drawingSession, (current) => setArrowType(current, type)));
  }

  function changeDrawing(change: (current: ArrowDrawing) => ArrowDrawing): void {
    update(updateArrowDrawing(session, change));
  }

  function apply(edit: Parameters<typeof applyDocumentEdit>[1]): void {
    update(applyDocumentEdit(session, edit));
  }

  function deleteWithConfirm(stepKey: string): void {
    const states = statesLeftUnreachable(document, stepKey).map(
      (stateId) => names.get(stateId) ?? stateId,
    );
    const question =
      states.length === 0
        ? "Delete this step?"
        : `Delete this step? These states would go too: ${states.join(", ")}.`;
    if (window.confirm(question)) {
      update(removeStep(session, stepKey));
    }
  }

  function addChangeFromPanel(pastedSmiles: string, removedText: string): void {
    if (toolkit === null) {
      return;
    }
    const removedFragmentMapNumbers = removedText
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "")
      .map(Number);
    update(addChange(session, { pastedSmiles, removedFragmentMapNumbers }, toolkit));
    panelKind = null;
  }

  function showState(stateId: string): void {
    update(selectState(session, stateId));
  }

  function showStep(stepKey: string): void {
    update(selectStep(session, stepKey));
  }

  function applySmiles(mappedSmiles: string, regenerate: boolean): void {
    update(applyStateSmiles(session, mappedSmiles, regenerate));
  }

  function saveArrowSet(): void {
    const stepKey = session.selectedStepKey;
    if (stepKey !== null) {
      update(saveDrawnArrowsAs(session, { answerKind: "partialArrowSet", stepKey }));
    }
  }

  function anotherRoute(fromStateId: string): void {
    const selected = selectState(session, fromStateId);
    const name = names.get(fromStateId) ?? fromStateId;
    update({
      ...selected,
      message: { tone: "neutral", text: `Draw the other route's first step from ${name}.` },
    });
  }
</script>

<div class="stage2 mt">
  <section class="card canvas-card" aria-label="Drawing">
    <div class="toolbar" role="toolbar" aria-label="Tools">
      <button
        class="tool"
        aria-pressed={session.mode === "drawArrows" && arrowType === "pair"}
        onclick={() => {
          drawWith("pair");
        }}
      >
        ⟶ Arrow
      </button>
      <button
        class="tool"
        aria-pressed={session.mode === "drawArrows" && arrowType === "fishHook"}
        onclick={() => {
          drawWith("fishHook");
        }}
      >
        ⇀ Fish-hook
      </button>
      <button
        class="tool"
        aria-pressed={session.mode === "moveAtoms"}
        onclick={() => {
          setMode("moveAtoms");
        }}
      >
        ✥ Move atoms
      </button>
      <span class="menu">
        <button
          class="tool"
          aria-expanded={moreOpen}
          aria-pressed={session.mode === "showHydrogen" || session.mode === "wedges"}
          onclick={() => {
            moreOpen = !moreOpen;
          }}
        >
          ⋯ More
        </button>
        {#if moreOpen}
          <div class="menu-pop" role="menu">
            {#each MORE_ITEMS as item (item.label)}
              <button role="menuitem" onclick={item.choose}>
                {item.label}<small>{item.hint}</small>
              </button>
            {/each}
          </div>
        {/if}
      </span>
      <span class="spacer"></span>
      <span class="small muted">Viewing: {selectedName}</span>
    </div>
    <DrawingCanvas {session} {update} />
    <p class="small muted canvas-hint">
      {#if session.mode === "drawArrows"}
        Tap a <b>source</b> (lone pair, bond or unpaired electron), then where the electrons
        <b>go</b>.
      {:else if session.mode === "moveAtoms"}
        Drag atoms to tidy the layout.
      {:else if session.mode === "showHydrogen"}
        Tap an atom to show one of its hydrogens (in every state).
      {:else if session.mode === "wedges"}
        Choose a style, then tap a bond: the narrow end goes on the more substituted atom; tap again
        to flip it.
      {/if}
    </p>
    {#if session.mode === "wedges"}
      <div class="seg" role="group" aria-label="Wedge style">
        {#each WEDGE_STYLES as option (option.style)}
          <button
            aria-pressed={session.wedgeStyle === option.style}
            onclick={() => {
              update(setWedgeStyle(session, option.style));
            }}
          >
            {option.label}
          </button>
        {/each}
      </div>
    {/if}
    <StateStrip
      {document}
      selectedStateId={session.selectedStateId}
      selectedStepKey={session.selectedStepKey}
      onSelectState={showState}
      onSelectStep={showStep}
    />
  </section>

  <aside class="grid side">
    {#if panelKind !== null}
      <MorePanel
        {panelKind}
        {document}
        stateName={selectedName}
        mappedSmiles={mappedSmilesOf(document, session.selectedStateId)}
        {apply}
        onAddChange={addChangeFromPanel}
        onApplySmiles={applySmiles}
        onClose={() => {
          panelKind = null;
        }}
      />
    {/if}
    {#if session.selectedStepKey !== null}
      <StepCard
        {document}
        stepKey={session.selectedStepKey}
        {apply}
        onSelectState={showState}
        onAnotherRoute={anotherRoute}
        onDelete={deleteWithConfirm}
        canSaveArrowSet={(drawing?.drawnArrows.length ?? 0) > 0}
        onSaveArrowSet={saveArrowSet}
      />
    {/if}
    {#if drawing !== null}
      <section class="card flat" aria-label="New step">
        <div class="small muted">New step from <b>{selectedName}</b></div>
        <ArrowList {drawing} onChange={changeDrawing} />
        <div class="row mt">
          <span class="spacer"></span>
          <button
            class="btn primary"
            disabled={drawing.drawnArrows.length === 0}
            onclick={() => {
              update(makeArrowStep(session));
            }}
          >
            Make the step
          </button>
        </div>
        {#if session.selectedStepKey === null}
          <StateAdvanced {document} stateId={session.selectedStateId} {apply} />
        {/if}
      </section>
    {/if}
    <section class="card flat small muted">
      <b class="ink">How this works</b><br />
      {HOW_IT_WORKS}
    </section>
  </aside>
</div>
