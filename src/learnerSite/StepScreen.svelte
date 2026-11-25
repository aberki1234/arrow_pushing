<script lang="ts">
  // Practice mode: loads one reaction version and holds its step session. When the run is
  // complete it is saved to the learner's progress and the finished view replaces the screen.
  // Played from a problem set (learnContext, item 9b) it shows the breadcrumb, and the finished
  // view offers Next in set instead of related reactions.
  import type { Catalogue } from "../catalogue/catalogueReading.js";
  import {
    readProgress,
    runRecordOf,
    withRun,
    writeProgress,
  } from "../learnerProgress/learnerProgress.js";
  import { type StepSession, startStepSession } from "../stepSession/stepSession.js";
  import type { LearnPlayContext } from "../learnTracks/learnPlayContext.js";
  import { browserStorage } from "./browserStorage.js";
  import { learnHash } from "./learnView.js";
  import { loadSessionReaction } from "./reactionLoading.js";
  import RunSummary from "./RunSummary.svelte";
  import StepPlay from "./StepPlay.svelte";
  import { type FinishedViewExtras, finishedViewExtras } from "./runSummaryView.js";

  const {
    catalogue,
    reactionVersionRef,
    learnContext = null,
  }: {
    catalogue: Catalogue;
    reactionVersionRef: string;
    learnContext?: LearnPlayContext | null;
  } = $props();

  let session: StepSession | null = $state.raw(null);
  let startedAt = new Date().toISOString();
  let loadError: string | null = $state(null);
  let extras: FinishedViewExtras | null = $state.raw(null);

  $effect(() => {
    loadSessionReaction(catalogue, reactionVersionRef)
      .then((reaction) => {
        session = startStepSession(reaction);
      })
      .catch((error: unknown) => {
        loadError = String(error);
      });
  });

  function update(next: StepSession): void {
    if (next.phase === "complete" && session?.phase !== "complete") {
      const before = readProgress(browserStorage);
      const after = withRun(before, runRecordOf(next, startedAt));
      writeProgress(browserStorage, after);
      const allExtras = finishedViewExtras(catalogue, next.reaction, before, after);
      extras = learnContext === null ? allExtras : { ...allExtras, relatedCards: [] };
    }
    session = next;
  }

  function restart(): void {
    if (session !== null) {
      startedAt = new Date().toISOString();
      session = startStepSession(session.reaction);
    }
  }
</script>

{#snippet learnActions(context: LearnPlayContext)}
  {@const trackSlug = context.track.trackSlug}
  {@const problemSetSlug = context.problemSet.problemSetSlug}
  {#if context.afterRun.afterRunKind === "nextInSet"}
    <a
      class="btn primary"
      href={learnHash(trackSlug, problemSetSlug, context.afterRun.reactionSlug)}
    >
      Next in set: {context.afterRun.title}
    </a>
  {:else}
    <span class="pill good">Problem set complete ✓</span>
    {#if context.afterRun.nextProblemSet !== null}
      <a
        class="btn primary"
        href={learnHash(trackSlug, context.afterRun.nextProblemSet.problemSetSlug)}
      >
        Next problem set: {context.afterRun.nextProblemSet.title}
      </a>
    {/if}
  {/if}
  <a class="btn" href={learnHash(trackSlug, problemSetSlug)}>Back to {context.problemSet.title}</a>
{/snippet}

{#if learnContext !== null}
  <p class="small muted mt breadcrumb">
    <a href={learnHash(learnContext.track.trackSlug, learnContext.problemSet.problemSetSlug)}>
      {learnContext.breadcrumbText}
    </a>
  </p>
{/if}
{#if loadError !== null}
  <div class="card mt" role="alert">
    <h2>This reaction could not be loaded</h2>
    <p class="muted">{loadError}</p>
    <a class="btn" href="#/practice">Back to the reactions</a>
  </div>
{:else if session === null}
  <p class="muted mt">Loading the reaction…</p>
{:else if session.phase === "complete"}
  <RunSummary reaction={session.reaction} stepResults={session.stepResults} daily={null} {extras}>
    {#snippet actions()}
      <button class="btn" type="button" onclick={restart}>↺ Play again</button>
      {#if learnContext === null}
        <a class="btn primary" href="#/practice">Another reaction</a>
      {:else}
        {@render learnActions(learnContext)}
      {/if}
    {/snippet}
  </RunSummary>
{:else}
  <StepPlay
    {session}
    {update}
    heading={session.reaction.title}
    subtitle={session.reaction.subtitle}
  />
{/if}
