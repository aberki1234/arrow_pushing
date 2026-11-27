<script lang="ts">
  // The learner's progress (decided 2026-11-25, item 7c): streaks, first-try rate, mastery, the
  // last 28 days of daily puzzles, recurring misconceptions, the weakest reactions to practise
  // next, and export / import / reset. Everything lives in this browser. The Tracks section and
  // the reaction library went on 2026-11-26 (Learn and Practice show the same, at length).
  import { type Catalogue, localDateText } from "../../../core/catalogue/catalogueReading.js";
  import { streakOn } from "../../dailyPuzzle/dailyPuzzle.js";
  import {
    type LearnerProgress,
    readProgress,
    writeProgress,
  } from "../../learnerProgress/learnerProgress.js";
  import {
    exportFileName,
    exportText,
    importProgress,
    importSummaryText,
    resetProgress,
  } from "../../learnerProgress/progressTransfer.js";
  import {
    bestStreak,
    dailyHistory,
    firstTryRates,
    weekChangeText,
  } from "../../learnerStatistics/learningHistory.js";
  import {
    type MisconceptionInfo,
    misconceptionSlugsShown,
    recurringFeedback,
  } from "../../learnerStatistics/recurringFeedback.js";
  import {
    masteredCount,
    masteryByClass,
    masteryBySlug,
  } from "../../learnerStatistics/reactionMastery.js";
  import { practiseNext } from "../../learnerStatistics/practiseNext.js";
  import { browserStorage } from "../io/browserStorage.js";
  import { loadMisconceptionInfo } from "../io/misconceptionLoading.js";
  import ResultTiles from "../components/ResultTiles.svelte";
  import { siteRouteHash } from "../model/siteRoutes.js";

  const { catalogue }: { catalogue: Catalogue } = $props();

  const DAY_TONE_TO_TEXT = {
    good: "every step first try",
    helped: "solved with help",
    missed: "a step missed",
    notPlayed: "not played",
  } as const;

  const today = localDateText(new Date());
  let progress: LearnerProgress = $state.raw(readProgress(browserStorage));
  let slugToInfo: ReadonlyMap<string, ReadonlyMap<string, MisconceptionInfo>> = $state.raw(
    new Map(),
  );
  let transferMessage = $state("");

  const mastery = $derived(masteryBySlug(progress));
  const rates = $derived(firstTryRates(progress, new Date()));
  const recurring = $derived(recurringFeedback(progress, slugToInfo));
  const titleOf = (reactionSlug: string): string =>
    catalogue.reactions.find((entry) => entry.reactionSlug === reactionSlug)?.title ?? reactionSlug;
  const weakest = $derived(practiseNext(mastery, catalogue));

  $effect(() => {
    void loadMisconceptionInfo(catalogue, misconceptionSlugsShown(progress)).then((loaded) => {
      slugToInfo = loaded;
    });
  });

  function save(next: LearnerProgress): void {
    progress = next;
    writeProgress(browserStorage, next);
  }

  function exportFile(): void {
    const blob = new Blob([exportText(progress)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = exportFileName(today);
    link.click();
    URL.revokeObjectURL(link.href);
    transferMessage = `Exported ${link.download}.`;
  }

  async function importFile(event: Event & { currentTarget: HTMLInputElement }): Promise<void> {
    // Kept before awaiting: the event's currentTarget is gone once it has been dispatched.
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file === undefined) {
      return;
    }
    const fileText = await file.text();
    // Cleared, so choosing the same file again imports it again.
    input.value = "";
    const outcome = importProgress(progress, fileText);
    if (outcome.importOutcome === "refused") {
      transferMessage = outcome.refusalMessage;
      return;
    }
    save(outcome.mergedProgress);
    transferMessage = importSummaryText(outcome.addedRunCount, outcome.addedDailyResultCount);
  }

  function reset(): void {
    if (window.confirm("Forget all progress in this browser? This cannot be undone.")) {
      resetProgress(browserStorage);
      progress = readProgress(browserStorage);
      transferMessage = "Progress reset.";
    }
  }
</script>

<h1 class="mt">Your progress</h1>
<p class="muted">Stored in this browser only. No account needed.</p>

<div class="grid g3">
  <div class="card stat">
    <span class="small muted">Daily streak</span>
    <b>🔥 {streakOn(progress.dateToDailyResult, today)}</b>
    <span class="small muted">best: {bestStreak(progress.dateToDailyResult)}</span>
  </div>
  <div class="card stat">
    <span class="small muted">First-try arrows this week</span>
    <b>{rates.thisWeekPercent === null ? "—" : `${String(rates.thisWeekPercent)}%`}</b>
    <span class="small muted">{weekChangeText(rates)}</span>
  </div>
  <div class="card stat">
    <span class="small muted">Mastered</span>
    <b>{masteredCount(mastery)} / {catalogue.reactions.length}</b>
    <span class="small muted">reactions</span>
  </div>
</div>

<div class="grid g2 mt">
  <section class="card flat" aria-labelledby="history-heading">
    <h2 id="history-heading">Daily history</h2>
    <ol class="cal" aria-label="Last 28 days">
      {#each dailyHistory(progress.dateToDailyResult, today) as day (day.localDate)}
        <li
          class={`day ${day.dayTone}`}
          title={`${day.localDate}: ${DAY_TONE_TO_TEXT[day.dayTone]}`}
          aria-label={`${day.localDate}: ${DAY_TONE_TO_TEXT[day.dayTone]}`}
        ></li>
      {/each}
    </ol>
    <p class="small muted">Last 28 days · green first try · amber with help · red missed</p>
  </section>
  <section class="card flat" aria-labelledby="by-type-heading">
    <h2 id="by-type-heading">Mastery by type</h2>
    {#each masteryByClass(catalogue, mastery) as row (row.reactionClass)}
      <div class="row spread small">
        <span>{row.reactionClass}</span><span>{row.masteryPercent}%</span>
      </div>
      <div class="bar" role="presentation">
        <i style={`width:${String(row.masteryPercent)}%`}></i>
      </div>
    {/each}
  </section>
</div>

<section class="card flat mt" aria-labelledby="recurring-heading">
  <h2 id="recurring-heading">Your recurring misconceptions</h2>
  {#if recurring.length === 0}
    <p class="muted">Nothing yet: mistakes you make more than once will show up here.</p>
  {:else}
    <table class="t">
      <thead><tr><th>Pattern</th><th>Times</th><th>Where</th><th></th></tr></thead>
      <tbody>
        {#each recurring as row (row.groupKey)}
          <tr>
            <td>
              <b>{row.heading}</b>{#if row.message}<div class="small muted">{row.message}</div>{/if}
            </td>
            <td>{row.count}</td>
            <td>{row.reactionSlugs.map(titleOf).join(", ")}</td>
            <td>
              <a
                class="btn sm"
                href={siteRouteHash({ routeName: "play", reactionVersionRef: row.practiseRef })}
              >
                Practise
              </a>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<section class="card flat mt" aria-labelledby="practise-next-heading">
  <h2 id="practise-next-heading">Practise next</h2>
  {#if weakest.length === 0}
    <p class="muted">
      Finish a reaction to see your weakest here; mastered reactions are left out.
    </p>
  {:else}
    <ul class="practise-next">
      {#each weakest as entry (entry.reactionSlug)}
        <li class="row spread">
          <span class="row">
            <b>{entry.title}</b>
            <ResultTiles stepResults={entry.lastStepResults} small />
            <span class="small muted">mastery {entry.masteryPercent}%</span>
          </span>
          <a
            class="btn sm"
            href={siteRouteHash({
              routeName: "play",
              reactionVersionRef: entry.reactionVersionRef,
            })}
          >
            Practise
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<section class="card flat mt" aria-labelledby="backup-heading">
  <h2 id="backup-heading">Back up or move your progress</h2>
  <p class="muted small">
    Everything lives in this browser. Export a file and import it elsewhere.
  </p>
  <div class="row">
    <button class="btn" type="button" onclick={exportFile}>⬇ Export</button>
    <label class="btn">
      ⬆ Import<input
        class="hidden"
        type="file"
        accept="application/json,.json"
        onchange={importFile}
      />
    </label>
    <button class="btn" type="button" onclick={reset}>Reset</button>
  </div>
  <p class="small" role="status" aria-live="polite">{transferMessage}</p>
</section>
