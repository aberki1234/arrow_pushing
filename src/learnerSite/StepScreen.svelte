<script lang="ts">
  // Loads one reaction version and holds its step session; StepPlay renders it.
  import type { Catalogue } from "../catalogue/catalogueReading.js";
  import { fetchSiteJson, loadReactionDocument } from "../siteData/siteData.js";
  import { readSessionReaction } from "../stepSession/sessionReaction.js";
  import { type StepSession, startStepSession } from "../stepSession/stepSession.js";
  import StepPlay from "./StepPlay.svelte";

  const { catalogue, reactionVersionRef }: { catalogue: Catalogue; reactionVersionRef: string } =
    $props();

  let session: StepSession | null = $state.raw(null);
  let loadError: string | null = $state(null);

  $effect(() => {
    loadReactionDocument(fetchSiteJson, catalogue, reactionVersionRef)
      .then((reactionDocument) => {
        session = startStepSession(readSessionReaction(reactionDocument));
      })
      .catch((error: unknown) => {
        loadError = String(error);
      });
  });

  function restart(): void {
    if (session !== null) {
      session = startStepSession(session.reaction);
    }
  }
</script>

{#if loadError !== null}
  <div class="card mt" role="alert">
    <h2>This reaction could not be loaded</h2>
    <p class="muted">{loadError}</p>
    <a class="btn" href="#/">Back to the reactions</a>
  </div>
{:else if session === null}
  <p class="muted mt">Loading the reaction…</p>
{:else}
  <StepPlay
    {session}
    update={(next: StepSession) => {
      session = next;
    }}
    {restart}
  />
{/if}
