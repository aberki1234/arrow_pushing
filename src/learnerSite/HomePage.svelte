<script lang="ts">
  // Home (decided 2026-11-25, item 7c): the hero, today's puzzle card, continue learning (item
  // 9b), continue practising, the learner's mastery in brief, and browse by type. The daily
  // reaction stays unnamed here; since item 11 its card shows the starting materials and
  // conditions with a "?" for the product, and a solved daily its tiles and points.
  import { type Catalogue, catalogueTracks, localDateText } from "../catalogue/catalogueReading.js";
  import {
    dailyPageStateOf,
    dailyPuzzleOn,
    stepCountText,
    streakOn,
    timeUntilNextPuzzleText,
  } from "../dailyPuzzle/dailyPuzzle.js";
  import {
    readDailyInProgress,
    readProgress,
    runOfDailyResult,
  } from "../learnerProgress/learnerProgress.js";
  import { firstTryRates } from "../learnerStatistics/learningHistory.js";
  import {
    masteredCount,
    masteryByClass,
    masteryBySlug,
    refParts,
  } from "../learnerStatistics/reactionMastery.js";
  import {
    type MisconceptionInfo,
    misconceptionSlugsShown,
    recurringFeedback,
  } from "../learnerStatistics/recurringFeedback.js";
  import { preferredArrowStepsFrom } from "../stepSession/sessionReaction.js";
  import { maximumPoints, totalPoints } from "../stepSession/stepScoring.js";
  import { continueLearning } from "../learnTracks/continueLearning.js";
  import { nextUpInTrack } from "../learnTracks/trackProgress.js";
  import { browserStorage } from "./browserStorage.js";
  import { learnHash, nextUpHash } from "./learnView.js";
  import { loadMisconceptionInfo } from "./misconceptionLoading.js";
  import ReactionScheme from "./ReactionScheme.svelte";
  import { loadSessionReaction } from "./reactionLoading.js";
  import ResultTiles from "./ResultTiles.svelte";
  import { siteRouteHash } from "./siteRoutes.js";

  const { catalogue }: { catalogue: Catalogue } = $props();

  const MAXIMUM_DIFFICULTY_TIER = 3;
  const HERO_TEXT =
    "Draw curved arrows on real mechanisms of named reactions. The arrows are checked, not just " +
    "the product, with a nudge toward the right idea when you slip.";
  const today = localDateText(new Date());
  const progress = readProgress(browserStorage);
  const puzzle = $derived(dailyPuzzleOn(catalogue, today));
  const pageState = $derived(
    puzzle === null
      ? null
      : dailyPageStateOf(puzzle, progress, readDailyInProgress(browserStorage)),
  );
  const mastery = masteryBySlug(progress);
  const learning = $derived(continueLearning(catalogue, progress));
  const firstTrack = $derived(catalogueTracks(catalogue)[0]);
  const rates = firstTryRates(progress, new Date());
  const lastPractice = [...progress.runs]
    .filter((run) => run.mode === "practice")
    .sort((one, other) => other.startedAt.localeCompare(one.startedAt))[0];
  let puzzleStepCount: number | null = $state(null);
  let slugToInfo: ReadonlyMap<string, ReadonlyMap<string, MisconceptionInfo>> = $state.raw(
    new Map(),
  );
  const topMistake = $derived(recurringFeedback(progress, slugToInfo)[0]);

  $effect(() => {
    if (puzzle !== null) {
      void loadSessionReaction(catalogue, puzzle.reactionVersionRef).then((reaction) => {
        puzzleStepCount = preferredArrowStepsFrom(reaction, reaction.startStateId);
      });
    }
    void loadMisconceptionInfo(catalogue, misconceptionSlugsShown(progress).slice(0, 3)).then(
      (loaded) => {
        slugToInfo = loaded;
      },
    );
  });

  function entryOf(reactionSlug: string): Catalogue["reactions"][number] | undefined {
    return catalogue.reactions.find((entry) => entry.reactionSlug === reactionSlug);
  }

  function dots(difficultyTier: number): string {
    return "●".repeat(difficultyTier) + "○".repeat(MAXIMUM_DIFFICULTY_TIER - difficultyTier);
  }

  function capitalised(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
</script>

<section class="card hero mt">
  <h1>Mechanisms, one arrow at a time</h1>
  <p><b>Push the electrons. Get told why.</b> {HERO_TEXT}</p>
  <div class="row">
    <a class="btn primary" href="#/daily">▶ Today's puzzle</a>
    <a class="btn" href="#/practice">Practice mode</a>
  </div>
</section>

<div class="grid g2 mt">
  <section class="card" aria-labelledby="today-heading">
    {#if puzzle === null || pageState === null}
      <h2 id="today-heading">No puzzle today</h2>
      <p class="muted">Practise a reaction instead.</p>
    {:else}
      {@const entry = entryOf(refParts(puzzle.reactionVersionRef)[0])}
      <h2 id="today-heading">Daily puzzle #{puzzle.puzzleNumber}</h2>
      {#if pageState.pageState === "finished"}
        {@const run = runOfDailyResult(progress, pageState.dailyResult)}
        <p class="muted small">
          Solved{puzzleStepCount === null ? "" : ` · ${stepCountText(puzzleStepCount)}`}
          {#if entry}· <span class="dots">{dots(entry.difficultyTier)}</span>{/if}
          · 🔥 {streakOn(progress.dateToDailyResult, today)}-day streak
        </p>
        {#if run}
          <div class="row">
            <ResultTiles stepResults={run.stepResults} />
            <span>
              {totalPoints(run.stepResults)} / {maximumPoints(run.stepResults)} points
            </span>
          </div>
        {/if}
        <p class="small muted">Next puzzle in {timeUntilNextPuzzleText(new Date())}</p>
      {:else}
        <p class="muted small">
          Mystery reaction{puzzleStepCount === null ? "" : ` · ${stepCountText(puzzleStepCount)}`}
          {#if entry}· <span class="dots">{dots(entry.difficultyTier)}</span>{/if}
          · 🔥 {streakOn(progress.dateToDailyResult, today)}-day streak
        </p>
        {#if entry?.startState}
          <ReactionScheme
            startState={entry.startState}
            conditionsLabel={entry.conditionsLabel}
            abbreviatedGroups={entry.abbreviatedGroups ?? []}
            productState={null}
          />
        {/if}
        <div class="row mt">
          <a class="btn primary sm" href="#/daily">
            {pageState.pageState === "inProgress" ? "Continue" : "▶ Start"}
          </a>
          <span class="small muted">
            {#if pageState.pageState === "inProgress"}
              In progress · step {pageState.saved.snapshot.stepResults.length +
                1}{puzzleStepCount === null ? "" : ` of ${String(puzzleStepCount)}`}
            {:else}
              Next puzzle in {timeUntilNextPuzzleText(new Date())}
            {/if}
          </span>
        </div>
      {/if}
    {/if}
  </section>

  {#if learning !== null}
    <section class="card" aria-labelledby="learning-heading">
      <h2 id="learning-heading">Continue learning</h2>
      <p>
        <b>{learning.problemSet.title}</b>
        <span class="muted small">· {learning.track.title}</span>
      </p>
      {#if learning.nextUp === null}
        <p class="small muted">Problem set complete ✓</p>
        <a class="btn sm" href={learnHash(learning.track.trackSlug)}>Choose the next one</a>
      {:else}
        <p class="small">
          Next up: {learning.problemSet.checkpoint
            ? "the checkpoint"
            : entryOf(learning.nextUp.reactionSlug)?.title}
        </p>
        <a
          class="btn primary sm"
          href={nextUpHash(learning.track.trackSlug, learning.problemSet, learning.nextUp)}
        >
          Continue
        </a>
      {/if}
    </section>
  {:else if firstTrack !== undefined}
    {@const nextUp = nextUpInTrack(firstTrack, progress)}
    <section class="card" aria-labelledby="learning-heading">
      <h2 id="learning-heading">Start learning</h2>
      <p><b>{firstTrack.title}</b></p>
      <p class="small muted">{firstTrack.goal}</p>
      <a
        class="btn primary sm"
        href={nextUp === null
          ? learnHash(firstTrack.trackSlug)
          : nextUpHash(firstTrack.trackSlug, nextUp.problemSet, nextUp.setItem)}
      >
        Start
      </a>
      <a class="small" href={learnHash()}>All tracks →</a>
    </section>
  {/if}

  <section class="card" aria-labelledby="continue-heading">
    <h2 id="continue-heading">Continue practising</h2>
    {#if lastPractice === undefined}
      <p class="muted">Nothing practised yet. <a href="#/practice">Pick a reaction</a>.</p>
    {:else}
      {@const [lastSlug] = refParts(lastPractice.reactionVersionRef)}
      {@const lastEntry = entryOf(lastSlug)}
      <p>
        <b>{lastEntry?.title ?? lastSlug}</b>
      </p>
      <div class="row small">
        <span class="muted">Last time</span>
        <ResultTiles stepResults={lastPractice.stepResults} small />
      </div>
      {#if lastEntry}
        <a
          class="btn sm"
          href={siteRouteHash({
            routeName: "play",
            reactionVersionRef: `${lastSlug}@${String(lastEntry.latestReactionVersion)}`,
          })}
        >
          Practise again
        </a>
      {/if}
    {/if}
  </section>

  <section class="card" aria-labelledby="mastery-heading">
    <h2 id="mastery-heading">Your mastery</h2>
    <p>{masteredCount(mastery)} of {catalogue.reactions.length} reactions mastered</p>
    <p class="small">
      {rates.thisWeekPercent === null
        ? "No steps taken this week yet."
        : `${String(rates.thisWeekPercent)}% first-try arrows this week`}
    </p>
    {#if topMistake}
      <p class="small muted">Watch: {topMistake.heading} ({topMistake.count}×).</p>
    {/if}
    <a class="small" href="#/progress">All progress →</a>
  </section>

  <section class="card" aria-labelledby="browse-heading">
    <h2 id="browse-heading">Browse by mechanism type</h2>
    <div class="row">
      {#each masteryByClass(catalogue, mastery) as row (row.reactionClass)}
        <a
          class="chip"
          href={siteRouteHash({
            routeName: "practice",
            practiceQuery: `type=${row.reactionClass}`,
          })}
        >
          {capitalised(row.reactionClass)} · {row.reactionCount}
        </a>
      {/each}
    </div>
  </section>
</div>
