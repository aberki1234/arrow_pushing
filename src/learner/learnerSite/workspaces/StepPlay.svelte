<script lang="ts">
  // The step screen (items 7a, 7b): header, step tiles, the molecule canvas and the controls, in
  // practice or daily mode. All decisions live in stepSession/ and stepScreenView.ts; this only
  // wires them. The parent shows the finished view once the session is complete.
  import { fade } from "svelte/transition";
  import { drawCurvedArrow } from "../../../drawing/moleculeDrawing/state/curvedArrowGeometry.js";
  import type { PickTarget } from "../../../drawing/moleculeDrawing/state/stateDrawing.js";
  import {
    DAILY_ATTEMPTS_PER_STEP,
    type StepSession,
    cancelPick,
    checkStereo,
    ghostArrows,
    hasLimitedAttempts,
    revealedArrows,
    revealsReactionClass,
    setRacemicMixtureAnswer,
    tapPlace,
  } from "../../stepSession/stepSession.js";
  import { stereoQuestionDrawing, tapQuestionTarget } from "../model/stereoQuestionView.js";
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
  const stateDrawing = $derived(stateDrawingOf(reaction, currentStateId, scale));
  // Stereo question (docs/stereo-question.md): after correct arrows the product is drawn with
  // its question centres as targets; once answered right it stays; a miss shows the right answer.
  const question = $derived(session.currentStep?.stereoQuestion ?? null);
  const showsProduct = $derived(
    question !== null &&
      (session.phase === "stereoQuestion" || session.lastStereoAssessment !== null),
  );
  // The learner's drawing while the question is open; afterwards the product's own (a racemic
  // answer draws no wedges of its own).
  const stereo = $derived(
    session.phase === "stereoQuestion" ? stereoQuestionDrawing(session, scale) : null,
  );
  const drawing = $derived(
    stereo?.drawing ??
      (showsProduct && session.currentStep !== null
        ? stateDrawingOf(reaction, session.currentStep.toStateId, scale)
        : stateDrawing),
  );
  // The first tap draws a wedge or a dash (a C=C cis or trans) at random, so it gives nothing away.
  const firstTap = {
    relation: Math.random() < 0.5 ? "cis" : "trans",
    wedgeStyle: Math.random() < 0.5 ? "wedge" : "dash",
  } as const;
  const allSet = $derived(stereo !== null && stereo.targets.every((target) => target.isSet));
  const canCheckProduct = $derived(allSet || session.racemicMixtureAnswer);

  function tapQuestion(targetId: string): void {
    update(tapQuestionTarget(session, targetId, firstTap));
  }
  const arrowClass = $derived(session.phase === "stepCorrect" ? "good" : "");
  const drawnArrows = $derived(
    showsProduct
      ? []
      : [
          ...[...ghostArrows(session), ...revealedArrows(session)].map((curvedArrow) => ({
            drawn: drawCurvedArrow(drawing, curvedArrow),
            arrowClass: "ghost",
          })),
          ...(session.phase === "stepMissed" ? [] : session.drawnArrows).map((curvedArrow) => ({
            drawn: drawCurvedArrow(drawing, curvedArrow),
            arrowClass,
          })),
        ],
  );
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
    {#key `${session.currentStateId}/${String(showsProduct)}`}
      <div in:fade={{ duration: fadeMilliseconds }}>
        <MoleculeCanvas
          {drawing}
          arrows={drawnArrows}
          interactive={session.phase === "drawing"}
          selectedTargetId={pendingTargetId}
          {destinations}
          onPick={pickTarget}
        >
          {#snippet overlay()}
            {#if session.phase === "stereoQuestion" && stereo !== null}
              <g class="question-targets">
                {#each stereo.targets as target (target.targetId)}
                  <g
                    class="question-target"
                    class:set={target.isSet}
                    role="button"
                    tabindex="0"
                    aria-label={`${target.accessibleName}: ${
                      target.isSet ? "set, tap to change" : "not set yet"
                    }`}
                    onclick={() => {
                      tapQuestion(target.targetId);
                    }}
                    onkeydown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        tapQuestion(target.targetId);
                      }
                    }}
                  >
                    <circle cx={target.point.x} cy={target.point.y} r="17" />
                    {#if !target.isSet}
                      <text x={target.point.x + 15} y={target.point.y - 13} class="question-mark">
                        ?
                      </text>
                    {/if}
                  </g>
                {/each}
              </g>
            {/if}
          {/snippet}
        </MoleculeCanvas>
        <!-- During the question the caption ("(S)-butan-2-ol", "racemic") gives the answer. -->
        {#if session.phase !== "stereoQuestion" && (drawing.caption || drawing.stereoLabel)}
          <p class="caption muted">
            {[drawing.caption, drawing.stereoLabel].filter(Boolean).join(" · ")}
          </p>
        {/if}
      </div>
    {/key}
    <div class="hint-line" aria-live="polite">{canvasInstruction(session)}</div>
  </section>
  <aside class="grid" style="gap:12px">
    {#if session.phase === "stereoQuestion"}
      <div class="card flat" aria-label="Stereochemistry">
        <p style="margin-top:0">Draw the product's stereochemistry, then check it.</p>
        {#if hasLimitedAttempts(session.mode)}
          <p class="small muted">
            {String(DAILY_ATTEMPTS_PER_STEP - session.wrongCheckCount)} of {String(
              DAILY_ATTEMPTS_PER_STEP,
            )} attempts left
          </p>
        {/if}
        {#if question?.racemicMixture != null}
          <label class="racemic-choice small">
            <input
              type="checkbox"
              checked={session.racemicMixtureAnswer}
              onchange={(event) => {
                update(setRacemicMixtureAnswer(session, event.currentTarget.checked));
              }}
            />
            Both enantiomers form, 50 : 50 (a racemic mixture)
          </label>
        {/if}
        <button
          type="button"
          class="btn primary mt"
          disabled={!canCheckProduct}
          onclick={() => {
            update(checkStereo(session));
          }}
        >
          Check product
        </button>
      </div>
    {:else}
      <ArrowControls
        {session}
        {update}
        {radical}
        onArrowsChanged={() => (pendingTargetId = null)}
      />
    {/if}
    <FeedbackPanel feedback={feedbackPanelText(session)} />
  </aside>
</div>

<style>
  .question-target circle {
    fill: var(--accent);
    fill-opacity: 0.14;
    stroke: var(--accent);
    stroke-width: 2;
    stroke-dasharray: 4 3;
    cursor: pointer;
  }
  .question-target.set circle {
    fill-opacity: 0.04;
    stroke-dasharray: none;
  }
  .question-target:focus {
    outline: none;
  }
  .question-target:focus circle {
    stroke-width: 3.5;
  }
  .racemic-choice {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }
  .question-mark {
    font:
      800 15px system-ui,
      sans-serif;
    fill: var(--accent);
  }
</style>
