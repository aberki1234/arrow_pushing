<script lang="ts">
  // Today's daily puzzle (decided 2026-11-25, item 7b): before → in progress → finished. The
  // puzzle is fixed when the page opens, so one finished after midnight counts for the day it was
  // started. The daily run (model/learnerRun.ts) is saved after every check and step, resumed on
  // return, and records its daily result when complete.
  import { type Catalogue, localDateText } from "../../../core/catalogue/catalogueReading.js";
  import { dailyPuzzleOn, stepCountText, streakOn } from "../../dailyPuzzle/dailyPuzzle.js";
  import { preferredArrowStepsFrom } from "../../stepSession/sessionReaction.js";
  import type { StepSession } from "../../stepSession/stepSession.js";
  import { runDependencies } from "../io/runDependencies.js";
  import { type LearnerRun, loadRun, runAfterStep, startRun } from "../model/learnerRun.js";
  import ReactionScheme from "../components/ReactionScheme.svelte";
  import RunSummary from "../components/RunSummary.svelte";
  import StepPlay from "../workspaces/StepPlay.svelte";
  import { siteRouteHash } from "../model/siteRoutes.js";
  import { splitReactionVersionRef } from "../../../core/catalogue/reactionVersionRefs.js";

  const { catalogue }: { catalogue: Catalogue } = $props();

  const MAXIMUM_DIFFICULTY_TIER = 3;
  const INTRODUCTION =
    "Work out the mechanism from the reactants and conditions. The name is revealed at the end.";
  // Fixed when the page opens: a puzzle finished after midnight counts for the day it started.
  const puzzle = $derived(dailyPuzzleOn(catalogue, localDateText(new Date())));
  /** Today's reaction in the catalogue: its card's scheme (item 11). */
  const puzzleEntry = $derived(
    puzzle === null
      ? undefined
      : catalogue.reactions.find(
          (entry) => entry.reactionSlug === splitReactionVersionRef(puzzle.reactionVersionRef)[0],
        ),
  );
  const dependencies = $derived(runDependencies(catalogue));
  let run: LearnerRun | null = $state.raw(null);

  $effect(() => {
    if (puzzle === null) {
      return;
    }
    void loadRun({ runMode: "daily", puzzle }, dependencies).then((loaded) => {
      run = loaded;
    });
  });

  function start(): void {
    if (run !== null) {
      run = startRun(run, dependencies);
    }
  }

  function update(next: StepSession): void {
    if (run !== null) {
      run = runAfterStep(run, next, dependencies);
    }
  }

  function difficultyDots(difficultyTier: number): string {
    return "●".repeat(difficultyTier) + "○".repeat(MAXIMUM_DIFFICULTY_TIER - difficultyTier);
  }
</script>

{#if puzzle === null}
  <div class="card mt">
    <h1>No puzzle today</h1>
    <p class="muted">There is no daily puzzle for today's date yet. Try a reaction in practice.</p>
    <a class="btn primary" href="#/practice">Practise a reaction</a>
  </div>
{:else if run === null}
  <p class="muted mt">Loading today's puzzle…</p>
{:else if run.runPhase === "loadFailed"}
  <div class="card mt" role="alert">
    <h2>Today's puzzle could not be loaded</h2>
    <p class="muted">{run.loadError}</p>
  </div>
{:else if run.runPhase === "finished"}
  <RunSummary
    reaction={run.reaction}
    stepResults={run.stepResults}
    daily={{
      puzzleNumber: puzzle.puzzleNumber,
      streak: streakOn(run.progress.dateToDailyResult, puzzle.localDate),
    }}
    extras={run.extras}
  >
    {#snippet actions()}
      <a
        class="btn"
        href={siteRouteHash({ routeName: "play", reactionVersionRef: puzzle.reactionVersionRef })}
      >
        Practise this reaction
      </a>
      <a class="btn primary" href="#/practice">Other reactions</a>
    {/snippet}
  </RunSummary>
{:else if run.runPhase === "playing"}
  <StepPlay
    session={run.session}
    {update}
    heading={`Daily puzzle #${String(puzzle.puzzleNumber)}`}
    subtitle="Mystery named reaction: the name is revealed at the end."
  />
{:else}
  <section class="card hero mt" aria-labelledby="daily-heading">
    <div class="row small muted">
      <span>
        Difficulty <span class="dots">{difficultyDots(run.reaction.difficultyTier)}</span>
      </span>
      <span>🔥 Streak {streakOn(run.progress.dateToDailyResult, puzzle.localDate)}</span>
    </div>
    <h1 id="daily-heading" style="margin-top:8px">Daily puzzle #{puzzle.puzzleNumber}</h1>
    <p><b>Mystery named reaction.</b> {INTRODUCTION}</p>
    {#if puzzleEntry?.startState}
      <ReactionScheme
        startState={puzzleEntry.startState}
        conditionsLabel={puzzleEntry.conditionsLabel}
        abbreviatedGroups={puzzleEntry.abbreviatedGroups ?? []}
        productState={null}
      />
    {/if}
    <p class="muted">
      {stepCountText(preferredArrowStepsFrom(run.reaction, run.reaction.startStateId))}
    </p>
    <button class="btn primary" type="button" onclick={start}>Start</button>
  </section>
  <section class="card flat mt" aria-labelledby="how-heading">
    <h2 id="how-heading">How it works</h2>
    <ul>
      <li>Each step: draw the arrows for one elementary step. 3 attempts per step.</li>
      <li>Every step is worth 3 points. A wrong check costs a point, and so does each hint.</li>
      <li>Tiles: ✓ first try · ~ retry or hint · ✕ missed. Shapes as well as colours.</li>
    </ul>
  </section>
{/if}
