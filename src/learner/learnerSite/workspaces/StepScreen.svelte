<script lang="ts">
  // Practice mode: one practice run of a reaction version (model/learnerRun.ts), which records
  // itself in the learner's progress when complete; the finished view then replaces the screen.
  // Played from a problem set (learnContext, item 9b) it shows the breadcrumb, and the finished
  // view offers Next in set instead of related reactions.
  import type { Catalogue } from "../../../core/catalogue/catalogueReading.js";
  import type { StepSession } from "../../stepSession/stepSession.js";
  import type { LearnPlayContext } from "../../learnTracks/learnPlayContext.js";
  import { runDependencies } from "../io/runDependencies.js";
  import { learnHash } from "../model/learnView.js";
  import { type LearnerRun, loadRun, runAfterStep, startRun } from "../model/learnerRun.js";
  import RunSummary from "../components/RunSummary.svelte";
  import StepPlay from "./StepPlay.svelte";

  const {
    catalogue,
    reactionVersionRef,
    learnContext = null,
  }: {
    catalogue: Catalogue;
    reactionVersionRef: string;
    learnContext?: LearnPlayContext | null;
  } = $props();

  const dependencies = $derived(runDependencies(catalogue));
  let run: LearnerRun | null = $state.raw(null);

  $effect(() => {
    const setting = {
      runMode: "practice",
      reactionVersionRef,
      inProblemSet: learnContext !== null,
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

  function restart(): void {
    if (run !== null) {
      run = startRun(run, dependencies);
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
{#if run === null}
  <p class="muted mt">Loading the reaction…</p>
{:else if run.runPhase === "loadFailed"}
  <div class="card mt" role="alert">
    <h2>This reaction could not be loaded</h2>
    <p class="muted">{run.loadError}</p>
    <a class="btn" href="#/practice">Back to the reactions</a>
  </div>
{:else if run.runPhase === "finished"}
  <RunSummary
    reaction={run.reaction}
    stepResults={run.stepResults}
    daily={null}
    extras={run.extras}
  >
    {#snippet actions()}
      <button class="btn" type="button" onclick={restart}>↺ Play again</button>
      {#if learnContext === null}
        <a class="btn primary" href="#/practice">Another reaction</a>
      {:else}
        {@render learnActions(learnContext)}
      {/if}
    {/snippet}
  </RunSummary>
{:else if run.runPhase === "playing"}
  <StepPlay
    session={run.session}
    {update}
    heading={run.reaction.title}
    subtitle={run.reaction.subtitle}
  />
{/if}
