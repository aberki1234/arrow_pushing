<script lang="ts">
  // Today's daily puzzle (decided 2026-11-25, item 7b): before → in progress → finished. The
  // puzzle is fixed when the page opens, so one finished after midnight counts for the day it was
  // started. An unfinished puzzle is saved after every check and step, and resumed on return.
  import { type Catalogue, localDateText } from "../../core/catalogue/catalogueReading.js";
  import {
    type DailyPageState,
    dailyPageStateOf,
    dailyPuzzleOn,
    dailyResultOf,
    stepCountText,
    streakOn,
  } from "../dailyPuzzle/dailyPuzzle.js";
  import {
    type LearnerProgress,
    clearDailyInProgress,
    readDailyInProgress,
    readProgress,
    runOfDailyResult,
    runRecordOf,
    withDailyResult,
    withRun,
    writeDailyInProgress,
    writeProgress,
  } from "../learnerProgress/learnerProgress.js";
  import { resumeStepSession, sessionSnapshot } from "../stepSession/sessionSnapshot.js";
  import { type SessionReaction, preferredArrowStepsFrom } from "../stepSession/sessionReaction.js";
  import { type StepSession, startStepSession } from "../stepSession/stepSession.js";
  import { browserStorage } from "./browserStorage.js";
  import { loadSessionReaction } from "./reactionLoading.js";
  import ReactionScheme from "./ReactionScheme.svelte";
  import RunSummary from "./RunSummary.svelte";
  import StepPlay from "./StepPlay.svelte";
  import { type FinishedViewExtras, finishedViewExtras } from "./runSummaryView.js";
  import { siteRouteHash } from "./siteRoutes.js";

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
          (entry) => entry.reactionSlug === puzzle.reactionVersionRef.split("@")[0],
        ),
  );
  let progress: LearnerProgress = $state.raw(readProgress(browserStorage));
  let pageState: DailyPageState | null = $state.raw(null);
  let reaction: SessionReaction | null = $state.raw(null);
  let session: StepSession | null = $state.raw(null);
  let startedAt = "";
  let loadError: string | null = $state(null);
  let extras: FinishedViewExtras | null = $state.raw(null);

  $effect(() => {
    if (puzzle === null) {
      return;
    }
    const opened = dailyPageStateOf(puzzle, progress, readDailyInProgress(browserStorage));
    if (opened.pageState === "before" && opened.dropSavedPuzzle) {
      clearDailyInProgress(browserStorage);
    }
    loadSessionReaction(catalogue, puzzle.reactionVersionRef)
      .then((loaded) => {
        reaction = loaded;
        if (opened.pageState === "inProgress") {
          startedAt = opened.saved.startedAt;
          session = resumeStepSession(loaded, opened.saved.snapshot);
        }
        pageState = opened;
      })
      .catch((error: unknown) => {
        loadError = String(error);
      });
  });

  function saveUnfinished(next: StepSession): void {
    if (puzzle === null) {
      return;
    }
    writeDailyInProgress(browserStorage, {
      formatVersion: 1,
      localDate: puzzle.localDate,
      puzzleNumber: puzzle.puzzleNumber,
      reactionVersionRef: puzzle.reactionVersionRef,
      startedAt,
      snapshot: sessionSnapshot(next),
    });
  }

  function finish(next: StepSession): void {
    if (puzzle === null) {
      return;
    }
    const run = runRecordOf(next, startedAt);
    const dailyResult = dailyResultOf(puzzle, run);
    const before = readProgress(browserStorage);
    progress = withDailyResult(withRun(before, run), puzzle.localDate, dailyResult);
    extras = finishedViewExtras(catalogue, next.reaction, before, progress);
    writeProgress(browserStorage, progress);
    clearDailyInProgress(browserStorage);
    pageState = { pageState: "finished", dailyResult };
  }

  function start(): void {
    if (reaction === null || puzzle === null) {
      return;
    }
    startedAt = new Date().toISOString();
    session = startStepSession(reaction, "daily");
    saveUnfinished(session);
    pageState = { pageState: "inProgress", saved: readDailyInProgress(browserStorage) ?? never() };
  }

  function never(): never {
    throw new Error("the daily puzzle just saved could not be read back");
  }

  function update(next: StepSession): void {
    session = next;
    if (next.phase === "complete") {
      finish(next);
    } else {
      saveUnfinished(next);
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
{:else if loadError !== null}
  <div class="card mt" role="alert">
    <h2>Today's puzzle could not be loaded</h2>
    <p class="muted">{loadError}</p>
  </div>
{:else if reaction === null || pageState === null}
  <p class="muted mt">Loading today's puzzle…</p>
{:else if pageState.pageState === "finished"}
  {@const run = runOfDailyResult(progress, pageState.dailyResult)}
  <RunSummary
    {reaction}
    stepResults={run?.stepResults ?? []}
    daily={{
      puzzleNumber: puzzle.puzzleNumber,
      streak: streakOn(progress.dateToDailyResult, puzzle.localDate),
    }}
    extras={extras ?? finishedViewExtras(catalogue, reaction, progress, progress)}
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
{:else if pageState.pageState === "inProgress" && session !== null}
  <StepPlay
    {session}
    {update}
    heading={`Daily puzzle #${String(puzzle.puzzleNumber)}`}
    subtitle="Mystery named reaction: the name is revealed at the end."
  />
{:else}
  <section class="card hero mt" aria-labelledby="daily-heading">
    <div class="row small muted">
      <span>Difficulty <span class="dots">{difficultyDots(reaction.difficultyTier)}</span></span>
      <span>🔥 Streak {streakOn(progress.dateToDailyResult, puzzle.localDate)}</span>
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
      {stepCountText(preferredArrowStepsFrom(reaction, reaction.startStateId))}
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
