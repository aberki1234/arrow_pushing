<script lang="ts">
  // A problem set (decided 2026-11-25, item 9b): the concept card, then the set items in order
  // with their marks, and a Start / Next up button. Opening it records it as the last problem
  // set touched, for Home's Continue learning card. A checkpoint (item 9c) hides the names of
  // reactions not yet done in it and is played here, one attempt at a time (CheckpointRun).
  import { type Catalogue, conceptFigureFilePath } from "../catalogue/catalogueReading.js";
  import {
    readProgress,
    withLastProblemSetRef,
    writeProgress,
  } from "../learnerProgress/learnerProgress.js";
  import { checkpointAttemptOrder } from "../learnTracks/checkpointAttempt.js";
  import { findProblemSet } from "../learnTracks/learnPlayContext.js";
  import { nextUpInProblemSet, problemSetProgress } from "../learnTracks/trackProgress.js";
  import { browserStorage } from "./browserStorage.js";
  import type { SetItem } from "../trackFiles/trackSchemaViolations.js";
  import CheckpointRun from "./CheckpointRun.svelte";
  import ConceptCard from "./ConceptCard.svelte";
  import ReactionCard from "./ReactionCard.svelte";
  import { difficultyDots, learnHash, setItemMarkText } from "./learnView.js";

  const {
    catalogue,
    trackSlug,
    problemSetSlug,
  }: { catalogue: Catalogue; trackSlug: string; problemSetSlug: string } = $props();

  const found = $derived(findProblemSet(catalogue, trackSlug, problemSetSlug));
  let progress = $state.raw(readProgress(browserStorage));
  /** The checkpoint attempt being played, in its shuffled order; null on the page itself. */
  let attemptOrder: readonly SetItem[] | null = $state.raw(null);

  function endAttempt(): void {
    attemptOrder = null;
    progress = readProgress(browserStorage);
  }

  $effect(() => {
    if (found !== null) {
      const touched = withLastProblemSetRef(
        readProgress(browserStorage),
        `${trackSlug}/${problemSetSlug}`,
      );
      writeProgress(browserStorage, touched);
    }
  });

  function entryOf(reactionSlug: string): Catalogue["reactions"][number] | undefined {
    return catalogue.reactions.find((entry) => entry.reactionSlug === reactionSlug);
  }
</script>

{#if found === null}
  <div class="card mt" role="alert">
    <h1>Problem set not found</h1>
    <p class="muted">It may have been renamed or withdrawn.</p>
    <a class="btn" href={learnHash()}>All tracks</a>
  </div>
{:else if attemptOrder !== null}
  <CheckpointRun
    {catalogue}
    track={found.track}
    problemSet={found.problemSet}
    {attemptOrder}
    {endAttempt}
  />
{:else}
  {@const { track, problemSet } = found}
  {@const setProgress = problemSetProgress(track.trackSlug, problemSet, progress)}
  {@const nextUp = nextUpInProblemSet(track.trackSlug, problemSet, progress)}
  {@const nextProblemSet = track.problemSets[track.problemSets.indexOf(problemSet) + 1]}
  <p class="small muted mt"><a href={learnHash(track.trackSlug)}>{track.title}</a> ›</p>
  <h1>
    {problemSet.title}
    {#if problemSet.checkpoint}<span class="pill warn">Checkpoint</span>{/if}
  </h1>
  <p class="muted">{problemSet.conceptInOneLine}</p>
  <div class="row small">
    <span>{setProgress.doneCount} of {setProgress.totalCount} done</span>
    <span class="muted">· mastery {setProgress.masteryPercent}%</span>
  </div>
  <div class="bar" role="presentation">
    <i style={`width:${String((100 * setProgress.doneCount) / setProgress.totalCount)}%`}></i>
  </div>

  <ConceptCard
    conceptCard={problemSet.conceptCard}
    figureSitePaths={(problemSet.conceptFigurePaths ?? []).map((figurePath) =>
      conceptFigureFilePath(track.trackSlug, figurePath),
    )}
    open={setProgress.doneCount === 0}
  />

  <ol class="set-items mt" aria-label="Set items">
    {#each setProgress.setItemMarks as mark, position (mark.setItem.reactionSlug)}
      {@const entry = entryOf(mark.setItem.reactionSlug)}
      {@const isNextUp = nextUp?.reactionSlug === mark.setItem.reactionSlug}
      {@const isHidden = problemSet.checkpoint && !mark.done}
      <li class="set-item">
        <ReactionCard entry={isHidden ? undefined : entry} isNext={isNextUp}>
          {#snippet details()}
            <h2>
              <span class="item-number" class:done={mark.done} aria-hidden="true">
                {mark.done ? "✓" : position + 1}
              </span>
              {#if isHidden}
                Hidden reaction
              {:else if problemSet.checkpoint}
                {entry?.title ?? mark.setItem.reactionSlug}
              {:else}
                <a
                  href={learnHash(
                    track.trackSlug,
                    problemSet.problemSetSlug,
                    mark.setItem.reactionSlug,
                  )}
                >
                  {entry?.title ?? mark.setItem.reactionSlug}
                </a>
              {/if}
            </h2>
            <p class="small muted">{mark.setItem.whyThisOne}</p>
            <div class="row">
              {#if entry}
                <span class="dots" aria-label={`difficulty ${String(entry.difficultyTier)} of 3`}>
                  {difficultyDots(entry.difficultyTier)}
                </span>
              {/if}
              <span class="pill" class:good={mark.mastered} class:new={isNextUp}>
                {isNextUp ? "Next up" : setItemMarkText(mark)}
              </span>
            </div>
          {/snippet}
        </ReactionCard>
      </li>
    {/each}
  </ol>

  <div class="row mt">
    {#if problemSet.checkpoint}
      <button
        class="btn primary"
        type="button"
        onclick={() => {
          attemptOrder = checkpointAttemptOrder(track.trackSlug, problemSet, progress, Math.random);
        }}
      >
        ▶ {nextUp === null ? "Play the checkpoint again" : "Start checkpoint"}
      </button>
      <span class="small muted">
        Names hidden · 3 attempts per step · a wrong check or a hint costs a point
      </span>
    {:else if nextUp !== null}
      <a
        class="btn primary"
        href={learnHash(track.trackSlug, problemSet.problemSetSlug, nextUp.reactionSlug)}
      >
        ▶ {setProgress.doneCount === 0 ? "Start" : "Next up"}: {entryOf(nextUp.reactionSlug)
          ?.title ?? nextUp.reactionSlug}
      </a>
    {:else}
      <span class="pill good">Problem set complete ✓</span>
      {#if nextProblemSet}
        <a class="btn primary" href={learnHash(track.trackSlug, nextProblemSet.problemSetSlug)}>
          Next problem set: {nextProblemSet.title}
        </a>
      {/if}
    {/if}
    <a class="btn" href={learnHash(track.trackSlug)}>Back to {track.title}</a>
  </div>
{/if}
