<script lang="ts">
  // One checkpoint attempt (decided 2026-11-26, item 9c): its reactions one after another in the
  // attempt's shuffled order, scored by the daily rules and named only when each is finished.
  // Each finished run is saved with the checkpoint's problemSetRef. `endAttempt` returns to the
  // checkpoint's page.
  import type { Catalogue, CatalogueTrack } from "../../../core/catalogue/catalogueReading.js";
  import type { StepSession } from "../../stepSession/stepSession.js";
  import type { ProblemSet, SetItem } from "../../../core/trackFiles/trackSchemaViolations.js";
  import { runDependencies } from "../io/runDependencies.js";
  import { learnHash } from "../model/learnView.js";
  import { type LearnerRun, loadRun, runAfterStep } from "../model/learnerRun.js";
  import RunSummary from "../components/RunSummary.svelte";
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
  let run: LearnerRun | null = $state.raw(null);
  let missingFromCatalogue = $state(false);

  const dependencies = $derived(runDependencies(catalogue));
  const problemSetRef = $derived(`${track.trackSlug}/${problemSet.problemSetSlug}`);
  const itemCount = $derived(attemptOrder.length);

  $effect(() => {
    const setItem = attemptOrder[position];
    const entry = catalogue.reactions.find(
      (candidate) => candidate.reactionSlug === setItem?.reactionSlug,
    );
    run = null;
    missingFromCatalogue = setItem === undefined || entry === undefined;
    if (entry === undefined) {
      return;
    }
    const setting = {
      runMode: "checkpoint",
      reactionVersionRef: `${entry.reactionSlug}@${String(entry.latestReactionVersion)}`,
      problemSetRef,
    } as const;
    void loadRun(setting, dependencies).then((loaded) => {
      run = loaded;
    });
  });

  function update(next: StepSession): void {
    if (run !== null) {
      run = runAfterStep(run, next, dependencies);
    }
  }
</script>

<p class="small muted mt">
  <a href={learnHash(track.trackSlug)}>{track.title}</a> › {problemSet.title} · reaction
  {position + 1} of {itemCount}
</p>
{#if missingFromCatalogue || run?.runPhase === "loadFailed"}
  <div class="card mt" role="alert">
    <h2>This reaction could not be loaded</h2>
    <p class="muted">
      {run?.runPhase === "loadFailed"
        ? run.loadError
        : "This reaction is no longer in the catalogue."}
    </p>
    <button class="btn" type="button" onclick={endAttempt}>Back to the checkpoint</button>
  </div>
{:else if run === null}
  <p class="muted mt">Loading the reaction…</p>
{:else if run.runPhase === "finished"}
  <RunSummary
    reaction={run.reaction}
    stepResults={run.stepResults}
    daily={null}
    extras={run.extras}
  >
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
{:else if run.runPhase === "playing"}
  <StepPlay
    session={run.session}
    {update}
    heading={`${problemSet.title} · reaction ${String(position + 1)} of ${String(itemCount)}`}
    subtitle="Mystery reaction: its name is revealed when you finish it."
  />
{/if}
