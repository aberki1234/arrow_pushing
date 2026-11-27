<script lang="ts">
  // A reaction as a horizontal card (decided 2026-11-26, item 11): its scheme on the left (the
  // start state, the conditions and a "?" box for the product), what the page says about it on
  // the right. A catalogue built before item 11 has no start state: the card shows the right
  // part only.
  import type { Snippet } from "svelte";
  import type { CatalogueEntry } from "../../core/catalogue/catalogueReading.js";
  import ReactionScheme from "./ReactionScheme.svelte";

  const {
    entry,
    details,
    isNext = false,
  }: { entry: CatalogueEntry | undefined; details: Snippet; isNext?: boolean } = $props();
</script>

<div class="reaction-card" class:next={isNext} class:plain={!entry?.startState}>
  {#if entry?.startState}
    <div class="reaction-card-scheme">
      <ReactionScheme
        startState={entry.startState}
        conditionsLabel={entry.conditionsLabel}
        abbreviatedGroups={entry.abbreviatedGroups ?? []}
        productState={null}
      />
    </div>
  {/if}
  <div class="reaction-card-details">{@render details()}</div>
</div>
