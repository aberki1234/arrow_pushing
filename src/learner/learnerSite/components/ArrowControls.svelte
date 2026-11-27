<script lang="ts">
  // The step's prompt, the arrow type, the arrows drawn, the hints and the step buttons.
  import { describeCurvedArrow } from "../../stepSession/arrowDescriptions.js";
  import type { ArrowType } from "../../stepSession/arrowPicking.js";
  import {
    DAILY_ATTEMPTS_PER_STEP,
    HINT_TIER_COUNT,
    type StepSession,
    checkArrows,
    clearArrows,
    continueToNextState,
    removeArrow,
    revealedArrows,
    setArrowType,
    showNextHint,
    shownHintTexts,
    undoArrow,
    hasLimitedAttempts,
  } from "../../stepSession/stepSession.js";
  import { stepCounterText } from "../model/stepScreenView.js";

  const {
    session,
    update,
    radical,
    onArrowsChanged,
  }: {
    session: StepSession;
    update: (next: StepSession) => void;
    radical: boolean;
    onArrowsChanged: () => void;
  } = $props();

  const drawing = $derived(session.phase === "drawing");
  const prompt = $derived(
    session.reaction.stateIdToState.get(session.currentStateId)?.learnerPrompt ?? "",
  );
  const hintTexts = $derived(shownHintTexts(session));
  const attemptsLeft = $derived(DAILY_ATTEMPTS_PER_STEP - session.wrongCheckCount);
  const pipSlots = Array.from({ length: DAILY_ATTEMPTS_PER_STEP }, (unusedEntry, slot) => slot);
  const showsPrompt = $derived(
    session.phase === "drawing" ||
      session.phase === "stepCorrect" ||
      session.phase === "stepMissed",
  );
  const attemptsLeftName = $derived(
    `${String(attemptsLeft)} of ${String(DAILY_ATTEMPTS_PER_STEP)} attempts left`,
  );

  function change(next: StepSession): void {
    onArrowsChanged();
    update(next);
  }

  function chooseArrowType(arrowType: ArrowType): void {
    change(setArrowType(session, arrowType));
  }
</script>

<div class="card flat">
  <div class="small muted">{stepCounterText(session)}</div>
  {#if hasLimitedAttempts(session.mode) && session.phase === "drawing"}
    <div class="small" aria-label={attemptsLeftName}>
      <span class="muted">Attempts left</span>
      <span class="pips" aria-hidden="true">
        {#each pipSlots as slot (slot)}
          <span class:off={slot >= attemptsLeft}></span>
        {/each}
      </span>
    </div>
  {/if}
  {#if showsPrompt}
    <h2 style="margin:2px 0 10px">{prompt}</h2>
    <div class="row small" style="margin-bottom:10px">
      <span class="muted" id="arrow-type-label">Arrow type</span>
      <div class="seg" role="group" aria-labelledby="arrow-type-label">
        <button
          type="button"
          aria-pressed={session.arrowType === "pair"}
          disabled={!drawing}
          onclick={() => {
            chooseArrowType("pair");
          }}
        >
          ⟶ electron pair (2 e⁻)
        </button><button
          type="button"
          aria-pressed={session.arrowType === "fishHook"}
          disabled={!drawing}
          onclick={() => {
            chooseArrowType("fishHook");
          }}
        >
          ⇀ fish-hook (1 e⁻)
        </button>
      </div>
      {#if radical}<span class="pill rad">radical</span>{/if}
    </div>
    {#if session.phase === "stepMissed"}
      <ol class="arrowlist" aria-label="The step's arrows">
        {#each revealedArrows(session) as curvedArrow, position (position)}
          <li><b>{position + 1}.</b> {describeCurvedArrow(curvedArrow)}</li>
        {/each}
      </ol>
    {:else if session.drawnArrows.length === 0}
      <div class="small muted">
        Tap a <b>source</b> (lone pair, bond or unpaired electron), then a
        <b>target</b> (atom or bond).
      </div>
    {:else}
      <ol class="arrowlist" aria-label="Your arrows">
        {#each session.drawnArrows as curvedArrow, position (position)}
          <li>
            <b>{position + 1}.</b>
            {describeCurvedArrow(curvedArrow)}
            {#if drawing}
              <button
                class="x"
                type="button"
                aria-label={`Remove arrow ${String(position + 1)}`}
                onclick={() => {
                  change(removeArrow(session, position));
                }}
              >
                ×
              </button>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
    {#if hintTexts.length > 0}
      <ol class="hints" aria-label="Hints">
        {#each hintTexts as hintText, position (position)}
          <li>💡 {hintText}</li>
        {/each}
      </ol>
    {/if}
  {/if}
  <div class="row mt">
    {#if drawing}
      <button
        class="btn sm"
        type="button"
        onclick={() => {
          change(undoArrow(session));
        }}
      >
        ↶ Undo
      </button>
      <button
        class="btn sm"
        type="button"
        onclick={() => {
          change(clearArrows(session));
        }}
      >
        Clear
      </button>
      <button
        class="btn sm"
        type="button"
        disabled={session.hintsShown >= HINT_TIER_COUNT}
        onclick={() => {
          update(showNextHint(session));
        }}
      >
        💡 Hint {Math.min(session.hintsShown + 1, HINT_TIER_COUNT)}/{HINT_TIER_COUNT}
      </button>
      <span class="spacer"></span>
      <button
        class="btn primary"
        type="button"
        onclick={() => {
          change(checkArrows(session));
        }}
      >
        Check
      </button>
    {:else if session.phase === "stepCorrect" || session.phase === "stepMissed"}
      <span class="spacer"></span>
      <button
        class={session.phase === "stepCorrect" ? "btn good" : "btn primary"}
        type="button"
        onclick={() => {
          change(continueToNextState(session));
        }}
      >
        Next step →
      </button>
    {:else if session.phase === "changeEvent"}
      <span class="spacer"></span>
      <button
        class="btn primary"
        type="button"
        onclick={() => {
          change(continueToNextState(session));
        }}
      >
        Continue →
      </button>
    {/if}
  </div>
  <div class="small muted" style="margin-top:6px">
    {hasLimitedAttempts(session.mode)
      ? `${session.mode === "daily" ? "Daily" : "Checkpoint"}: each wrong check and each hint ` +
        "costs a point."
      : "Practice: hints are free."}
  </div>
</div>
