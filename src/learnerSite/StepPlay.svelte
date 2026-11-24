<script lang="ts">
  // The step screen in practice mode (item 7a): header, step tiles, the molecule canvas and the
  // controls. All decisions live in stepSession/ and stepScreenView.ts; this only wires them.
  import { fade } from "svelte/transition";
  import { drawCurvedArrow } from "../moleculeDrawing/curvedArrowGeometry.js";
  import type { PickTarget } from "../moleculeDrawing/stateDrawing.js";
  import {
    type StepSession,
    cancelPick,
    chooseDestination,
    ghostArrows,
    tapPlace,
  } from "../stepSession/stepSession.js";
  import ArrowControls from "./ArrowControls.svelte";
  import FeedbackPanel from "./FeedbackPanel.svelte";
  import MoleculeCanvas from "./MoleculeCanvas.svelte";
  import StepTiles from "./StepTiles.svelte";
  import {
    canvasInstruction,
    currentStateDrawing,
    destinationChoice,
    drawingScaleOf,
    feedbackPanelText,
    tappedPlaceOf,
  } from "./stepScreenView.js";

  const {
    session,
    update,
    restart,
  }: { session: StepSession; update: (next: StepSession) => void; restart: () => void } = $props();

  // The cross-fade between states (decided 2026-11-25), off under prefers-reduced-motion.
  const FADE_MILLISECONDS = 250;
  const fadeMilliseconds = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 0
    : FADE_MILLISECONDS;

  const reaction = $derived(session.reaction);
  const scale = $derived(drawingScaleOf(reaction));
  const drawing = $derived(currentStateDrawing(session, scale));
  const arrowClass = $derived(session.phase === "stepCorrect" ? "good" : "");
  const drawnArrows = $derived([
    ...ghostArrows(session).map((curvedArrow) => ({
      drawn: drawCurvedArrow(drawing, curvedArrow),
      arrowClass: "ghost",
    })),
    ...session.drawnArrows.map((curvedArrow) => ({
      drawn: drawCurvedArrow(drawing, curvedArrow),
      arrowClass,
    })),
  ]);
  const choice = $derived(destinationChoice(session));
  const radical = $derived(reaction.reactionClasses.includes("radical"));
  let pendingTargetId: string | null = $state(null);

  function pickTarget(target: PickTarget): void {
    const next = tapPlace(session, tappedPlaceOf(target));
    if (next.pendingSource === null) {
      pendingTargetId = null;
    } else if (session.pendingSource === null) {
      pendingTargetId = target.pickTargetId;
    }
    update(next);
  }

  function cancel(): void {
    pendingTargetId = null;
    update(cancelPick(session));
  }

  function choose(optionIndex: number): void {
    pendingTargetId = null;
    update(chooseDestination(session, optionIndex));
  }

  function onWindowKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      cancel();
    }
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<div class="row spread mt">
  <div>
    <div class="row">
      <span class="pill">Practice</span>
      {#each reaction.reactionClasses as reactionClass (reactionClass)}
        <span class="pill" class:rad={reactionClass === "radical"}>{reactionClass}</span>
      {/each}
    </div>
    <h1 style="margin-top:6px">{reaction.title}</h1>
    <div class="muted">{reaction.subtitle}</div>
  </div>
  <a class="btn sm" href="#/">All reactions</a>
</div>
<div class="row spread mt">
  <StepTiles {session} />
  {#if reaction.conditionsLabel}
    <span class="small muted">Conditions: {reaction.conditionsLabel}</span>
  {/if}
</div>

<div class="stage mt">
  <section class="card canvas" aria-label="Mechanism canvas">
    {#key session.currentStateId}
      <div in:fade={{ duration: fadeMilliseconds }}>
        <MoleculeCanvas
          {drawing}
          arrows={drawnArrows}
          interactive={session.phase === "drawing" && choice === null}
          selectedTargetId={pendingTargetId}
          {choice}
          onPick={pickTarget}
          onChoose={choose}
          onCancelChoice={cancel}
        />
        {#if drawing.caption}
          <p class="caption muted">{drawing.caption}</p>
        {/if}
      </div>
    {/key}
    <div class="hint-line" aria-live="polite">{canvasInstruction(session)}</div>
  </section>
  <aside class="grid" style="gap:12px">
    <ArrowControls {session} {update} {radical} onArrowsChanged={() => (pendingTargetId = null)} />
    <FeedbackPanel feedback={feedbackPanelText(session)} />
    {#if session.phase === "complete"}
      <div class="row">
        <button class="btn" type="button" onclick={restart}>Play again</button>
        <a class="btn primary" href="#/">Another reaction</a>
      </div>
    {/if}
  </aside>
</div>
