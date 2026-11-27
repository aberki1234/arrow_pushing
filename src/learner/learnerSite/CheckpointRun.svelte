<script lang="ts">
  // One checkpoint attempt (decided 2026-11-26, item 9c): its reactions one after another in the
  // attempt's shuffled order, scored by the daily rules and named only when each is finished.
  // Each finished run is saved with the checkpoint's problemSetRef. `endAttempt` returns to the
  // checkpoint's page.
  import type { Catalogue, CatalogueTrack } from "../../core/catalogue/catalogueReading.js";
  import {
    readProgress,
    runRecordOf,
    withRun,
    writeProgress,
  } from "../learnerProgress/learnerProgress.js";
  import { type StepSession, startStepSession } from "../stepSession/stepSession.js";
  import type { ProblemSet, SetItem } from "../../core/trackFiles/trackSchemaViolations.js";
  import { browserStorage } from "./browserStorage.js";
  import { learnHash } from "./learnView.js";
  import { loadSessionReaction } from "./reactionLoading.js";
  import RunSummary from "./RunSummary.svelte";
  import { type FinishedViewExtras, finishedViewExtras } from "./runSummaryView.js";
  import StepPlay from "./StepPlay.svelte";

  const {
    catalogue,
    track,
    problemSet,
    attemptOrder,
    endAttempt,
  }: {
    catalogue: Catalogue;
    track: CatalogueTrack;
    problemSet: ProblemSet;
    attemptOrder: readonly SetItem[];
    endAttempt: () => void;
  } = $props();

  let position = $state(0);
  let session: StepSession | null = $state.raw(null);
  let startedAt = new Date().toISOString();
  let loadError: string | null = $state(null);
  let extras: FinishedViewExtras | null = $state.raw(null);

  const problemSetRef = $derived(`${track.trackSlug}/${problemSet.problemSetSlug}`);
  const itemCount = $derived(attemptOrder.length);

  $effect(() => {
    const setItem = attemptOrder[position];
    const entry = catalogue.reactions.find(
      (candidate) => candidate.reactionSlug === setItem?.reactionSlug,
    );
    if (setItem === undefined || entry === undefined) {
      loadError = "This reaction is no longer in the catalogue.";
      return;
    }
    session = null;
    extras = null;
    loadSessionReaction(catalogue, `${entry.reactionSlug}@${String(entry.latestReactionVersion)}`)
      .then((reaction) => {
        startedAt = new Date().toISOString();
        session = startStepSession(reaction, "checkpoint");
      })
      .catch((error: unknown) => {
        loadError = String(error);
      });
  });

  function update(next: StepSession): void {
    if (next.phase === "complete" && session?.phase !== "complete") {
      const before = readProgress(browserStorage);
      const after = withRun(before, runRecordOf(next, startedAt, problemSetRef));
      writeProgress(browserStorage, after);
      extras = { ...finishedViewExtras(catalogue, next.reaction, before, after), relatedCards: [] };
    }
    session = next;
  }
</script>

<p class="small muted mt">
  <a href={learnHash(track.trackSlug)}>{track.title}</a> › {problemSet.title} · reaction
  {position + 1} of {itemCount}
</p>
{#if loadError !== null}
  <div class="card mt" role="alert">
    <h2>This reaction could not be loaded</h2>
    <p class="muted">{loadError}</p>
    <button class="btn" type="button" onclick={endAttempt}>Back to the checkpoint</button>
  </div>
{:else if session === null}
  <p class="muted mt">Loading the reaction…</p>
{:else if session.phase === "complete"}
  <RunSummary reaction={session.reaction} stepResults={session.stepResults} daily={null} {extras}>
    {#snippet actions()}
      {#if position + 1 < itemCount}
        <button
          class="btn primary"
          type="button"
          onclick={() => {
            position += 1;
          }}
        >
          Next reaction ({position + 2} of {itemCount})
        </button>
      {:else}
        <span class="pill good">Checkpoint complete ✓</span>
      {/if}
      <button class="btn" type="button" onclick={endAttempt}>Back to the checkpoint</button>
    {/snippet}
  </RunSummary>
{:else}
  <StepPlay
    {session}
    {update}
    heading={`${problemSet.title} · reaction ${String(position + 1)} of ${String(itemCount)}`}
    subtitle="Mystery reaction: its name is revealed when you finish it."
  />
{/if}
