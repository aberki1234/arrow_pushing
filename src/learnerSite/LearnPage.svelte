<script lang="ts">
  // Learn (decided 2026-11-25, item 9b): one card per track with its goal, how much is done and a
  // Continue button to its Next up. Practice is the library by reaction; Learn is the path.
  import { type Catalogue, catalogueTracks } from "../catalogue/catalogueReading.js";
  import { readProgress } from "../learnerProgress/learnerProgress.js";
  import { nextUpInTrack, trackProgress } from "../learnTracks/trackProgress.js";
  import { browserStorage } from "./browserStorage.js";
  import { learnHash, nextUpHash } from "./learnView.js";

  const { catalogue }: { catalogue: Catalogue } = $props();

  const progress = readProgress(browserStorage);
  const tracks = $derived(catalogueTracks(catalogue));
</script>

<h1 class="mt">Learn</h1>
<p class="muted">
  Guided tracks: each problem set teaches one idea, from the simplest case to the trickier ones.
  Nothing is locked; the order is a suggestion.
</p>

<ul class="grid g2 track-list">
  {#each tracks as track (track.trackSlug)}
    {@const progressOfTrack = trackProgress(track, progress)}
    {@const nextUp = nextUpInTrack(track, progress)}
    <li class="card">
      <h2><a href={learnHash(track.trackSlug)}>{track.title}</a></h2>
      <p class="muted small">{track.goal}</p>
      <div class="row spread small">
        <span>{progressOfTrack.doneCount} of {progressOfTrack.totalCount} done</span>
        <span class="muted">mastery {progressOfTrack.masteryPercent}%</span>
      </div>
      <div class="bar" role="presentation">
        <i
          style={`width:${String((100 * progressOfTrack.doneCount) / progressOfTrack.totalCount)}%`}
        ></i>
      </div>
      <div class="row mt">
        {#if nextUp === null}
          <span class="pill good">Track complete ✓</span>
          <a class="btn sm" href={learnHash(track.trackSlug)}>Review</a>
        {:else}
          <a
            class="btn primary sm"
            href={nextUpHash(track.trackSlug, nextUp.problemSet, nextUp.setItem)}
          >
            {progressOfTrack.doneCount === 0 ? "▶ Start" : "▶ Continue"}
          </a>
          <span class="small muted">Next up: {nextUp.problemSet.title}</span>
        {/if}
      </div>
    </li>
  {:else}
    <li class="muted">No tracks yet. <a href="#/practice">Practise a reaction</a> instead.</li>
  {/each}
</ul>
