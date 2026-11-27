<script lang="ts">
  // A track (decided 2026-11-25, item 9b): its problem sets as a numbered path, each with the
  // concept in a line, how many set items are done and a mastery ring; Next up is highlighted.
  import { type Catalogue, catalogueTracks } from "../../core/catalogue/catalogueReading.js";
  import { readProgress } from "../learnerProgress/learnerProgress.js";
  import { nextUpInTrack, trackProgress } from "../learnTracks/trackProgress.js";
  import { browserStorage } from "./browserStorage.js";
  import { learnHash } from "./learnView.js";

  const { catalogue, trackSlug }: { catalogue: Catalogue; trackSlug: string } = $props();

  const progress = readProgress(browserStorage);
  const track = $derived(
    catalogueTracks(catalogue).find((candidate) => candidate.trackSlug === trackSlug),
  );
</script>

{#if track === undefined}
  <div class="card mt" role="alert">
    <h1>Track not found</h1>
    <p class="muted">It may have been renamed or withdrawn.</p>
    <a class="btn" href={learnHash()}>All tracks</a>
  </div>
{:else}
  {@const progressOfTrack = trackProgress(track, progress)}
  {@const nextUp = nextUpInTrack(track, progress)}
  <p class="small muted mt"><a href={learnHash()}>Learn</a> ›</p>
  <h1>{track.title}</h1>
  <p class="muted">{track.goal}</p>
  <div class="row small">
    <span>{progressOfTrack.doneCount} of {progressOfTrack.totalCount} done</span>
    <span class="muted">· mastery {progressOfTrack.masteryPercent}%</span>
  </div>

  <ol class="track-path mt" aria-label="Problem sets">
    {#each progressOfTrack.problemSetProgresses as entry (entry.problemSet.problemSetSlug)}
      {@const isNextUp = nextUp?.problemSet.problemSetSlug === entry.problemSet.problemSetSlug}
      <li class="card path-step" class:next={isNextUp}>
        <div class="row spread">
          <div>
            <h2>
              <a href={learnHash(track.trackSlug, entry.problemSet.problemSetSlug)}>
                {entry.problemSet.title}
              </a>
              {#if entry.problemSet.checkpoint}<span class="pill warn">Checkpoint</span>{/if}
              {#if isNextUp}<span class="pill new">Next up</span>{/if}
            </h2>
            <p class="small muted">{entry.problemSet.conceptInOneLine}</p>
            <p class="small">{entry.doneCount} of {entry.totalCount} done</p>
          </div>
          <div
            class="ring"
            style={`--p:${String(entry.masteryPercent)}`}
            role="img"
            aria-label={`mastery ${String(entry.masteryPercent)}%`}
          >
            <span>{entry.masteryPercent}%</span>
          </div>
        </div>
      </li>
    {/each}
  </ol>
{/if}
