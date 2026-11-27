<script lang="ts">
  // A reaction played from a problem set (item 9b): the latest version, in practice mode, with
  // the breadcrumb and Next in set (learnPlayContext.ts). It records the problem set as the last
  // one touched, for Home's Continue learning card.
  import type { Catalogue } from "../../../core/catalogue/catalogueReading.js";
  import {
    readProgress,
    withLastProblemSetRef,
    writeProgress,
  } from "../../learnerProgress/learnerProgress.js";
  import { learnPlayContext } from "../../learnTracks/learnPlayContext.js";
  import { browserStorage } from "../io/browserStorage.js";
  import { learnHash } from "../model/learnView.js";
  import StepScreen from "../workspaces/StepScreen.svelte";

  const {
    catalogue,
    trackSlug,
    problemSetSlug,
    reactionSlug,
  }: { catalogue: Catalogue; trackSlug: string; problemSetSlug: string; reactionSlug: string } =
    $props();

  const context = $derived(learnPlayContext(catalogue, trackSlug, problemSetSlug, reactionSlug));

  $effect(() => {
    if (context !== null) {
      writeProgress(
        browserStorage,
        withLastProblemSetRef(readProgress(browserStorage), `${trackSlug}/${problemSetSlug}`),
      );
    }
  });
</script>

{#if context === null}
  <div class="card mt" role="alert">
    <h2>This reaction is not in that problem set</h2>
    <a class="btn" href={learnHash(trackSlug, problemSetSlug)}>Back to the problem set</a>
  </div>
{:else}
  <StepScreen {catalogue} reactionVersionRef={context.reactionVersionRef} learnContext={context} />
{/if}
