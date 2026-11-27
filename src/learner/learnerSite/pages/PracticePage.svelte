<script lang="ts">
  // The practice list (decided 2026-11-25, item 7c): every reaction with the learner's mastery,
  // filtered by type, difficulty and status and searched by title. The filters are kept in the
  // hash (replaced, not pushed, so typing a search does not fill the browser history). Each
  // reaction is a horizontal card with its scheme, one per row (item 11).
  import type { Catalogue } from "../../../core/catalogue/catalogueReading.js";
  import { readProgress } from "../../learnerProgress/learnerProgress.js";
  import {
    type PracticeFilters,
    type PracticeStatus,
    filteredCards,
    parsePracticeFilters,
    practiceCards,
    practiceFiltersQuery,
  } from "../../learnerStatistics/practiceList.js";
  import { masteryByClass, masteryBySlug } from "../../learnerStatistics/reactionMastery.js";
  import { browserStorage } from "../io/browserStorage.js";
  import ReactionCard from "../components/ReactionCard.svelte";
  import { siteRouteHash } from "../model/siteRoutes.js";

  const { catalogue, practiceQuery }: { catalogue: Catalogue; practiceQuery: string } = $props();

  const MAXIMUM_DIFFICULTY_TIER = 3;
  const DIFFICULTY_TIERS = [1, 2, 3];
  const STATUS_TO_LABEL: Readonly<Record<PracticeStatus, string>> = {
    new: "New",
    practised: "Practised",
    mastered: "Mastered",
  };
  const STATUSES: readonly PracticeStatus[] = ["new", "practised", "mastered"];

  const mastery = masteryBySlug(readProgress(browserStorage));
  const cards = $derived(practiceCards(catalogue, mastery));
  const reactionClasses = $derived(
    masteryByClass(catalogue, mastery).map((row) => row.reactionClass),
  );
  let filters: PracticeFilters = $state.raw(parsePracticeFilters(""));
  $effect.pre(() => {
    filters = parsePracticeFilters(practiceQuery);
  });
  const shown = $derived(filteredCards(cards, filters));

  function setFilters(next: PracticeFilters): void {
    filters = next;
    const hash = siteRouteHash({
      routeName: "practice",
      practiceQuery: practiceFiltersQuery(next),
    });
    window.history.replaceState(null, "", hash);
  }

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

<h1 class="mt">Practice</h1>
<p class="muted">Untimed, unlimited attempts, free hints. Pick a reaction.</p>

<div class="card flat">
  <div class="row">
    <span class="small muted">Type</span>
    <button
      class="chip"
      type="button"
      aria-pressed={filters.reactionClass === null}
      onclick={() => {
        setFilters({ ...filters, reactionClass: null });
      }}
    >
      All
    </button>
    {#each reactionClasses as reactionClass (reactionClass)}
      <button
        class="chip"
        type="button"
        aria-pressed={filters.reactionClass === reactionClass}
        onclick={() => {
          setFilters({ ...filters, reactionClass });
        }}
      >
        {capitalised(reactionClass)}
      </button>
    {/each}
  </div>
  <div class="row mt">
    <span class="small muted">Difficulty</span>
    <button
      class="chip"
      type="button"
      aria-pressed={filters.difficultyTier === null}
      onclick={() => {
        setFilters({ ...filters, difficultyTier: null });
      }}
    >
      All
    </button>
    {#each DIFFICULTY_TIERS as difficultyTier (difficultyTier)}
      <button
        class="chip"
        type="button"
        aria-pressed={filters.difficultyTier === difficultyTier}
        aria-label={`Difficulty ${String(difficultyTier)}`}
        onclick={() => {
          setFilters({ ...filters, difficultyTier });
        }}
      >
        {dots(difficultyTier)}
      </button>
    {/each}
    <span class="small muted" style="margin-left:12px">Status</span>
    <button
      class="chip"
      type="button"
      aria-pressed={filters.practiceStatus === null}
      onclick={() => {
        setFilters({ ...filters, practiceStatus: null });
      }}
    >
      All
    </button>
    {#each STATUSES as practiceStatus (practiceStatus)}
      <button
        class="chip"
        type="button"
        aria-pressed={filters.practiceStatus === practiceStatus}
        onclick={() => {
          setFilters({ ...filters, practiceStatus });
        }}
      >
        {STATUS_TO_LABEL[practiceStatus]}
      </button>
    {/each}
  </div>
  <label class="f" for="practice-search">Search</label>
  <input
    id="practice-search"
    type="text"
    value={filters.searchText}
    placeholder="Reaction name"
    oninput={(event) => {
      setFilters({ ...filters, searchText: event.currentTarget.value });
    }}
  />
</div>

<p class="small muted mt" aria-live="polite">{shown.length} of {cards.length} reactions</p>
<ul class="reaction-list" aria-label="Reactions">
  {#each shown as card (card.reactionSlug)}
    <li>
      <ReactionCard entry={entryOf(card.reactionSlug)}>
        {#snippet details()}
          <h2>
            <a
              href={siteRouteHash({
                routeName: "play",
                reactionVersionRef: card.reactionVersionRef,
              })}
            >
              {card.title}
            </a>
          </h2>
          {#if card.subtitle}<p class="muted small">{card.subtitle}</p>{/if}
          <div class="row">
            {#each card.reactionClasses as reactionClass (reactionClass)}
              <span class="pill" class:rad={reactionClass === "radical"}>{reactionClass}</span>
            {/each}
            <span class="dots" aria-label={`difficulty ${String(card.difficultyTier)} of 3`}>
              {dots(card.difficultyTier)}
            </span>
          </div>
          <div class="row">
            {#if card.masteryPercent === null}
              <span class="pill new">New</span>
            {:else if card.masteryPercent === 100}
              <span class="pill good">Mastered ✓</span>
            {:else}
              <span class="pill">Mastery {card.masteryPercent}%</span>
            {/if}
            {#if card.isUpdated}<span class="pill new">updated</span>{/if}
          </div>
        {/snippet}
      </ReactionCard>
    </li>
  {:else}
    <li class="muted">No reaction matches these filters.</li>
  {/each}
</ul>
