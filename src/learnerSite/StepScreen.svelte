<script lang="ts">
  // Practice mode: loads one reaction version and holds its step session. When the run is
  // complete it is saved to the learner's progress and the finished view replaces the screen.
  import type { Catalogue } from "../catalogue/catalogueReading.js";
  import {
    readProgress,
    runRecordOf,
    withRun,
    writeProgress,
  } from "../learnerProgress/learnerProgress.js";
  import { type StepSession, startStepSession } from "../stepSession/stepSession.js";
  import { browserStorage } from "./browserStorage.js";
  import { loadSessionReaction } from "./reactionLoading.js";
  import RunSummary from "./RunSummary.svelte";
  import StepPlay from "./StepPlay.svelte";

  const { catalogue, reactionVersionRef }: { catalogue: Catalogue; reactionVersionRef: string } =
    $props();

  let session: StepSession | null = $state.raw(null);
  let startedAt = new Date().toISOString();
  let loadError: string | null = $state(null);

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
      writeProgress(
        browserStorage,
        withRun(readProgress(browserStorage), runRecordOf(next, startedAt)),
      );
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

{#if loadError !== null}
  <div class="card mt" role="alert">
    <h2>This reaction could not be loaded</h2>
    <p class="muted">{loadError}</p>
    <a class="btn" href="#/">Back to the reactions</a>
  </div>
{:else if session === null}
  <p class="muted mt">Loading the reaction…</p>
{:else if session.phase === "complete"}
  <RunSummary reaction={session.reaction} stepResults={session.stepResults} daily={null}>
    {#snippet actions()}
      <button class="btn" type="button" onclick={restart}>↺ Play again</button>
      <a class="btn primary" href="#/">Another reaction</a>
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
