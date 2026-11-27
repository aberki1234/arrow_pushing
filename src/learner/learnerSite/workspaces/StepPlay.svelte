<script lang="ts">
  // The step screen (items 7a, 7b): header, step tiles, the molecule canvas and the controls, in
  // practice or daily mode. All decisions live in stepSession/ and stepScreenView.ts; this only
  // wires them. The parent shows the finished view once the session is complete.
  import { fade } from "svelte/transition";
  import { drawCurvedArrow } from "../../../drawing/moleculeDrawing/state/curvedArrowGeometry.js";
  import type { PickTarget } from "../../../drawing/moleculeDrawing/state/stateDrawing.js";
  import {
    type StepSession,
    cancelPick,
    ghostArrows,
    revealedArrows,
    revealsReactionClass,
    tapPlace,
  } from "../../stepSession/stepSession.js";
  import ArrowControls from "../components/ArrowControls.svelte";
  import FeedbackPanel from "../components/FeedbackPanel.svelte";
  import MoleculeCanvas from "../components/MoleculeCanvas.svelte";
  import StepTiles from "../components/StepTiles.svelte";
  import {
    canvasInstruction,
    destinationsOf,
    drawingScaleOf,
    feedbackPanelText,
    stateDrawingOf,
    tappedPlaceOf,
  } from "../model/stepScreenView.js";

  const {
    session,
    update,
    heading,
    subtitle,
  }: {
    session: StepSession;
    update: (next: StepSession) => void;
    /** The reaction's title, or "Daily puzzle #N" while a daily puzzle hides it. */
    heading: string;
    subtitle: string;
  } = $props();

  // The cross-fade between states (decided 2026-11-25), off under prefers-reduced-motion.
  const FADE_MILLISECONDS = 250;
  const fadeMilliseconds = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 0
    : FADE_MILLISECONDS;

  const reaction = $derived(session.reaction);
  const scale = $derived(drawingScaleOf(reaction));
  // Derived from the reaction and the state id only: a tap makes a new session but keeps both, so
  // the drawing (and the canvas) is not rebuilt while arrows are drawn (issue #1).
  const currentStateId = $derived(session.currentStateId);
  const drawing = $derived(stateDrawingOf(reaction, currentStateId, scale));
  const arrowClass = $derived(session.phase === "stepCorrect" ? "good" : "");
  const drawnArrows = $derived([
    ...[...ghostArrows(session), ...revealedArrows(session)].map((curvedArrow) => ({
      drawn: drawCurvedArrow(drawing, curvedArrow),
      arrowClass: "ghost",
    })),
    ...(session.phase === "stepMissed" ? [] : session.drawnArrows).map((curvedArrow) => ({
      drawn: drawCurvedArrow(drawing, curvedArrow),
      arrowClass,
    })),
  ]);
  const destinations = $derived(destinationsOf(session, drawing));
  // Only practice tags a radical reaction; daily and checkpoint leave radical or polar to the
  // learner (revealsReactionClass).
  const radical = $derived(
    revealsReactionClass(session.mode) && reaction.reactionClasses.includes("radical"),
  );
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
      {#if session.mode === "daily"}
        <span class="pill new">Daily puzzle</span>
      {:else if session.mode === "checkpoint"}
        <span class="pill warn">Checkpoint</span>
      {:else}
        <span class="pill">Practice</span>
        {#each reaction.reactionClasses as reactionClass (reactionClass)}
          <span class="pill" class:rad={reactionClass === "radical"}>{reactionClass}</span>
        {/each}
      {/if}
    </div>
    <h1 style="margin-top:6px">{heading}</h1>
    <div class="muted">{subtitle}</div>
  </div>
  <a class="btn sm" href="#/practice">All reactions</a>
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
          interactive={session.phase === "drawing"}
          selectedTargetId={pendingTargetId}
          {destinations}
          onPick={pickTarget}
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
  </aside>
</div>
