<script lang="ts">
  // The reactions in the catalogue, each linking to practice mode. Temporary (item 7a): the
  // practice page with filters and search replaces it in item 7c.
  import type { Catalogue } from "../catalogue/catalogueReading.js";
  import { siteRouteHash } from "./siteRoutes.js";

  const { catalogue }: { catalogue: Catalogue } = $props();

  const MAXIMUM_DIFFICULTY_TIER = 3;

  function difficultyName(difficultyTier: number): string {
    return `difficulty ${String(difficultyTier)} of ${String(MAXIMUM_DIFFICULTY_TIER)}`;
  }

  function playHash(reactionSlug: string, reactionVersion: number): string {
    return siteRouteHash({
      routeName: "play",
      reactionVersionRef: `${reactionSlug}@${String(reactionVersion)}`,
    });
  }
</script>

<h1 class="mt">Practise a mechanism</h1>
<p class="muted">Choose a reaction and draw the curved arrows, one step at a time.</p>
<ul class="grid g3 reaction-list">
  {#each catalogue.reactions as entry (entry.reactionSlug)}
    <li class="card">
      <div class="row">
        {#each entry.reactionClasses as reactionClass (reactionClass)}
          <span class="pill" class:rad={reactionClass === "radical"}>{reactionClass}</span>
        {/each}
        <span class="dots" aria-label={difficultyName(entry.difficultyTier)}>
          {"●".repeat(entry.difficultyTier)}{"○".repeat(
            MAXIMUM_DIFFICULTY_TIER - entry.difficultyTier,
          )}
        </span>
      </div>
      <h2>{entry.title}</h2>
      {#if entry.subtitle}
        <p class="muted small">{entry.subtitle}</p>
      {/if}
      <a class="btn primary sm" href={playHash(entry.reactionSlug, entry.latestReactionVersion)}>
        Practise
      </a>
    </li>
  {/each}
</ul>
