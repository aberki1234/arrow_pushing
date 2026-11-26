<script lang="ts">
  // Learn (revised 2026-11-26, item 11; mockups/layout.html): one card per curriculum level,
  // holding its tracks in code order as horizontal cards (code, the showcase reaction drawn
  // whole, goal, progress, Start / Continue to Next up), with the planned tracks as "Coming soon".
  // A level without a live track is folded and lists its planned tracks. Practice is the library
  // by reaction; Learn is the path.
  import type { Catalogue, CatalogueTrack } from "../catalogue/catalogueReading.js";
  import { readProgress } from "../learnerProgress/learnerProgress.js";
  import { type TrackLevel, trackLevels } from "../learnTracks/trackLevels.js";
  import { nextUpInTrack, trackProgress } from "../learnTracks/trackProgress.js";
  import { browserStorage } from "./browserStorage.js";
  import { learnHash, nextUpHash } from "./learnView.js";
  import ReactionScheme from "./ReactionScheme.svelte";

  const { catalogue }: { catalogue: Catalogue } = $props();

  const progress = readProgress(browserStorage);
  const levels = $derived(trackLevels(catalogue));
  /** The first live track not yet complete gets the accent border. */
  const nextTrackSlug = $derived(
    levels
      .flatMap((level) => level.rows)
      .flatMap((row) => (row.rowKind === "live" ? [row.track] : []))
      .find((track) => nextUpInTrack(track, progress) !== null)?.trackSlug,
  );

  function showcaseOf(track: CatalogueTrack): Catalogue["reactions"][number] | undefined {
    return catalogue.reactions.find((entry) => entry.reactionSlug === track.showcaseReactionSlug);
  }
</script>

{#snippet levelHeader(level: TrackLevel)}
  <header class="level-header">
    <span class="level-badge" aria-hidden="true">{level.letter}</span>
    <div>
      <h2>{level.title} <span class="muted small">· {level.yearText}</span></h2>
      <p class="small muted">{level.description}</p>
    </div>
  </header>
{/snippet}

{#snippet liveTrack(code: string, track: CatalogueTrack)}
  {@const progressOfTrack = trackProgress(track, progress)}
  {@const nextUp = nextUpInTrack(track, progress)}
  {@const showcase = showcaseOf(track)}
  <li class="track-card" class:next={track.trackSlug === nextTrackSlug}>
    <span class="track-code">{code}</span>
    <div class="track-figure">
      {#if showcase?.startState && track.showcaseProductState}
        <ReactionScheme
          startState={showcase.startState}
          conditionsLabel={showcase.conditionsLabel}
          abbreviatedGroups={showcase.abbreviatedGroups ?? []}
          productState={track.showcaseProductState}
        />
      {/if}
    </div>
    <div class="track-info">
      <h3>
        <a href={learnHash(track.trackSlug)}>{track.title}</a>
        {#if track.trackSlug === nextTrackSlug && progressOfTrack.doneCount > 0}
          <span class="pill new">Next up</span>
        {/if}
      </h3>
      <p class="small muted">{track.goal}</p>
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
            class="btn sm"
            class:primary={track.trackSlug === nextTrackSlug}
            href={nextUpHash(track.trackSlug, nextUp.problemSet, nextUp.setItem)}
          >
            {progressOfTrack.doneCount === 0 ? "▶ Start" : "▶ Continue"}
          </a>
          <span class="small muted">Next up: {nextUp.problemSet.title}</span>
        {/if}
      </div>
    </div>
  </li>
{/snippet}

{#snippet levelRows(level: TrackLevel)}
  <ul class="level-rows" aria-label={`${level.title} tracks`}>
    {#each level.rows as row (row.rowKind === "live" ? row.track.trackSlug : row.curriculumCode)}
      {#if row.rowKind === "live"}
        {@render liveTrack(row.curriculumCode, row.track)}
      {:else}
        <li class="track-card planned">
          <span class="track-code">{row.curriculumCode}</span>
          <div class="track-info">
            <h3>{row.title} <span class="pill">Coming soon</span></h3>
          </div>
        </li>
      {/if}
    {/each}
  </ul>
{/snippet}

<h1 class="mt">Learn</h1>
<p class="muted">
  Guided tracks, grouped by year: each problem set teaches one idea, from the simplest case to the
  trickier ones. Nothing is locked; the order is a suggestion.
</p>

{#each levels as level (level.level)}
  {#if level.isOpen}
    <section class="card level mt">
      {@render levelHeader(level)}
      {@render levelRows(level)}
    </section>
  {:else}
    <details class="card level mt">
      <summary>{@render levelHeader(level)}</summary>
      <p class="small muted level-planned">
        Coming soon: {level.rows
          .map((row) => `${row.curriculumCode} ${row.rowKind === "planned" ? row.title : ""}`)
          .join(" · ")}
      </p>
    </details>
  {/if}
{/each}
