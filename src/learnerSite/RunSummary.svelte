<script lang="ts">
  // The finished view of a run, in both modes (decided 2026-11-25, item 7b): the reaction named,
  // one tile per step taken, step by step, the mechanism summary and the attribution. A daily
  // run adds its points, the share text with Copy, the streak and the time to the next puzzle.
  import type { Snippet } from "svelte";
  import { shareText, timeUntilNextPuzzleText } from "../dailyPuzzle/dailyPuzzle.js";
  import type { SessionReaction } from "../stepSession/sessionReaction.js";
  import { maximumPoints, totalPoints } from "../stepSession/stepScoring.js";
  import type { StepResult } from "../stepSession/stepSession.js";
  import { type FinishedViewExtras, attributionText, summarySteps } from "./runSummaryView.js";
  import { siteRouteHash } from "./siteRoutes.js";

  const {
    reaction,
    stepResults,
    daily,
    extras,
    actions,
  }: {
    reaction: SessionReaction;
    stepResults: readonly StepResult[];
    daily: { puzzleNumber: number; streak: number } | null;
    /** From the learner's history (item 7c); null when not worked out. */
    extras: FinishedViewExtras | null;
    actions: Snippet;
  } = $props();

  const OUTCOME_TO_TILE = {
    firstTry: { tileClass: "g", glyph: "✓" },
    afterRetry: { tileClass: "y", glyph: "~" },
    afterHint: { tileClass: "y", glyph: "~" },
    missed: { tileClass: "r", glyph: "✕" },
  } as const;

  const steps = $derived(summarySteps(reaction, stepResults));
  const modeLabel = $derived(
    daily === null ? "Practice" : `Daily puzzle #${String(daily.puzzleNumber)}`,
  );
  const pointsText = $derived(
    `${String(totalPoints(stepResults))} / ${String(maximumPoints(stepResults))} points`,
  );
  const share = $derived(daily === null ? "" : shareText(daily.puzzleNumber, stepResults));
  let copyFailed = $state(false);
  let copied = $state(false);

  async function copyShareText(): Promise<void> {
    try {
      await navigator.clipboard.writeText(share);
      copied = true;
    } catch {
      copyFailed = true;
    }
  }

  function selectAll(node: HTMLTextAreaElement): void {
    node.select();
  }
</script>

<section class="card mt" aria-labelledby="summary-heading">
  <div class="small muted">
    {modeLabel} · Mechanism complete
  </div>
  <h1 id="summary-heading" style="margin-top:4px">{reaction.title}</h1>
  <p class="muted">
    {reaction.subtitle}{reaction.conditionsLabel ? ` · ${reaction.conditionsLabel}` : ""}
  </p>
  <ol class="row mini-tiles" aria-label="Steps" style="list-style:none;margin:0;padding:0">
    {#each stepResults as stepResult, position (position)}
      <li
        class={`tile ${OUTCOME_TO_TILE[stepResult.stepOutcome].tileClass}`}
        aria-label={`Step ${String(position + 1)}: ${steps[position]?.outcomeText ?? ""}`}
      >
        {OUTCOME_TO_TILE[stepResult.stepOutcome].glyph}
      </li>
    {/each}
  </ol>
  {#if daily !== null}
    <p class="mt">
      <b>{pointsText}</b> · streak {daily.streak}
      🔥 · next puzzle in {timeUntilNextPuzzleText(new Date())}
    </p>
    <div class="share" aria-label="Share text">{share}</div>
    <div class="row mt">
      <button class="btn sm" type="button" onclick={copyShareText}>
        {copied ? "Copied" : "Copy result"}
      </button>
    </div>
    {#if copyFailed}
      <label class="small muted">
        Copying is not allowed here; select the text and copy it:
        <textarea class="share-fallback" readonly rows="1" use:selectAll>{share}</textarea>
      </label>
    {/if}
  {/if}
  {#if extras !== null}
    <p class="small muted mt">
      Mastery {extras.masteryBefore === null
        ? ""
        : `${String(extras.masteryBefore)}% → `}{extras.masteryAfter}%
    </p>
  {/if}
  <div class="row mt">{@render actions()}</div>
</section>

{#if extras !== null && (extras.watchOutRows.length > 0 || extras.relatedCards.length > 0)}
  <div class="grid g2 mt">
    {#if extras.watchOutRows.length > 0}
      <section class="card flat" aria-labelledby="watch-heading">
        <h2 id="watch-heading">Watch out for</h2>
        <ul>
          {#each extras.watchOutRows as row (row.groupKey)}
            <li>
              <b>{row.heading}</b> ({row.count}×){#if row.message}: {row.message}{/if}
            </li>
          {/each}
        </ul>
        <p class="small muted">
          From your history with this reaction; see <a href="#/progress">Progress</a>.
        </p>
      </section>
    {/if}
    {#if extras.relatedCards.length > 0}
      <section class="card flat" aria-labelledby="related-heading">
        <h2 id="related-heading">More {reaction.reactionClasses[0] ?? ""} reactions</h2>
        <ul>
          {#each extras.relatedCards as card (card.reactionSlug)}
            <li>
              <a
                href={siteRouteHash({
                  routeName: "play",
                  reactionVersionRef: card.reactionVersionRef,
                })}
              >
                {card.title}
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>
{/if}

<section class="card flat mt" aria-labelledby="steps-heading">
  <h2 id="steps-heading">Step by step</h2>
  <ol class="summary-steps">
    {#each steps as step (step.stepNumber)}
      <li>
        <div class="row spread">
          <b>Step {step.stepNumber}. {step.prompt}</b>
          <span class="small muted">{step.outcomeText}</span>
        </div>
        <div class="small">Arrows: {step.arrowTexts.join(" · ")}</div>
        {#if step.explanation}
          <p class="small muted" style="margin:4px 0 0">{step.explanation}</p>
        {/if}
      </li>
    {/each}
  </ol>
  <h2 class="mt">The mechanism</h2>
  <p>{reaction.mechanismSummary}</p>
  <p class="small muted">
    {attributionText(reaction)}{reaction.references.length > 0
      ? ` · ${reaction.references.join("; ")}`
      : ""}
  </p>
</section>
