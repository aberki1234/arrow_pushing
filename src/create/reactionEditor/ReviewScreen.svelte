<script lang="ts">
  // The review screen (docs/SPEC.md §6, "Contributors"; mockups/review.html): Play as learner on
  // the submitted version; by default only what changed against the previous published version
  // (a new reaction shows everything); notes pinned to a change and an overall note; Publish or
  // Request changes.
  import StepPlay from "../../learner/learnerSite/StepPlay.svelte";
  import { startPreview } from "../reactionEditing/publishing/learnerPreview.js";
  import { versionChanges } from "../reactionEditing/review/versionChanges.js";
  import type { StepSession } from "../../learner/stepSession/stepSession.js";
  import ChangeCard from "./ChangeCard.svelte";
  import type { ContributorClient, ReviewDecision, ReviewMaterial } from "./contributorClient.js";

  const {
    client,
    reactionSlug,
    onBack,
  }: {
    client: ContributorClient;
    reactionSlug: string;
    /** Back to the queue, with what happened ("" when nothing was decided). */
    onBack: (message: string) => void;
  } = $props();

  let material = $state.raw<ReviewMaterial | null>(null);
  let loadError = $state("");
  let showEverything = $state(false);
  let keyToNote = $state<Record<string, string>>({});
  let comment = $state("");
  let deciding = $state(false);
  let refusal = $state("");
  let preview = $state.raw<StepSession | null>(null);

  $effect(() => {
    client.reviewMaterial(reactionSlug).then(
      (loaded) => {
        material = loaded;
      },
      (error: unknown) => {
        loadError = error instanceof Error ? error.message : String(error);
      },
    );
  });

  const changes = $derived(
    material === null
      ? []
      : versionChanges(showEverything ? null : material.previousPublished, material.submitted),
  );
  const changedCount = $derived(
    material === null ? 0 : versionChanges(material.previousPublished, material.submitted).length,
  );
  const title = $derived(material === null ? reactionSlug : String(material.submitted.title));

  function publishNote(authorName: string): string {
    return (
      `Publishing credits ${authorName} and rebuilds the site. Learners midway through an ` +
      "earlier version finish it; new runs use this one."
    );
  }

  async function decide(reviewDecision: ReviewDecision): Promise<void> {
    deciding = true;
    refusal = "";
    const pinnedNotes = Object.entries(keyToNote)
      .filter(([, note]) => note.trim() !== "")
      .map(([changeKey, note]) => ({ changeKey, note }));
    const outcome = await client.review(reactionSlug, { reviewDecision, comment, pinnedNotes });
    deciding = false;
    if (outcome.outcome === "refused") {
      refusal = outcome.reason;
      return;
    }
    onBack(
      reviewDecision === "publish"
        ? `Published ${title}: the learner site is being rebuilt.`
        : `Changes requested on ${title}: the author sees your notes.`,
    );
  }
</script>

<div class="row mt">
  <button
    class="btn sm"
    onclick={() => {
      onBack("");
    }}
  >
    ← Waiting for review
  </button>
</div>
{#if loadError !== ""}
  <p class="small message bad" role="status">{loadError}</p>
{:else if material === null}
  <p class="small muted">Loading…</p>
{:else if preview !== null}
  <div class="row spread mt">
    <span class="pill new">Playing the submission as a learner</span>
    <button
      class="btn sm"
      onclick={() => {
        preview = null;
      }}
    >
      Back to the review
    </button>
  </div>
  <StepPlay
    session={preview}
    update={(next: StepSession) => {
      preview = next;
    }}
    heading={title}
    subtitle=""
  />
{:else}
  {@const loaded = material}
  <div class="row spread mt">
    <div>
      <h2>{title} · version {loaded.reactionVersion}</h2>
      <p class="small muted">
        {loaded.previousVersion === null
          ? `New, by ${loaded.authorName}`
          : `Suggested by ${loaded.authorName} · compared with version ` +
            String(loaded.previousVersion)}
        {#if loaded.submissionNote !== null}
          · “{loaded.submissionNote}”
        {/if}
      </p>
    </div>
    <button
      class="btn primary"
      onclick={() => {
        preview = startPreview(loaded.submitted, String(loaded.submitted.startStateId));
      }}
    >
      ▶ Play as learner
    </button>
  </div>
  <div class="review mt">
    <div>
      {#if loaded.previousPublished !== null}
        <div class="seg" role="group" aria-label="Show">
          <button aria-pressed={!showEverything} onclick={() => (showEverything = false)}>
            What changed ({changedCount})
          </button>
          <button aria-pressed={showEverything} onclick={() => (showEverything = true)}>
            Everything
          </button>
        </div>
      {/if}
      {#if changes.length === 0}
        <p class="small muted mt">Nothing changed against the previous version.</p>
      {/if}
      {#each changes as change (change.changeKey)}
        <ChangeCard
          {change}
          submitted={loaded.submitted}
          previous={loaded.previousPublished}
          note={keyToNote[change.changeKey] ?? ""}
          onNote={(note: string) => {
            keyToNote = { ...keyToNote, [change.changeKey]: note };
          }}
        />
      {/each}
    </div>
    <section class="card sticky" aria-label="Your decision">
      <h3>Your decision</h3>
      <label class="f" for="review-comment">Overall note, sent to {loaded.authorName}</label>
      <textarea id="review-comment" rows="4" maxlength="4000" bind:value={comment}></textarea>
      {#if refusal !== ""}
        <p class="small message bad" role="status">{refusal}</p>
      {/if}
      <div class="row mt">
        <button
          class="btn primary"
          disabled={deciding}
          onclick={() => {
            void decide("publish");
          }}
        >
          ✓ Publish version {loaded.reactionVersion}
        </button>
        <button
          class="btn"
          disabled={deciding}
          onclick={() => {
            void decide("changes_requested");
          }}
        >
          Request changes
        </button>
      </div>
      <p class="small muted">{publishNote(loaded.authorName)}</p>
    </section>
  </div>
{/if}
