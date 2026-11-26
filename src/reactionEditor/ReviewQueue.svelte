<script lang="ts">
  // The review queue (docs/SPEC.md §6, "Contributors"): submissions waiting, oldest first, each
  // marked new reaction / improvement / resubmitted. A reviewer's own are not listed.
  import type { QueuedSubmission } from "./contributorClient.js";
  import { QUEUE_KIND_TO_LABEL, queueLine } from "./reviewView.js";

  const {
    queue,
    message,
    onReview,
    now = new Date(),
  }: {
    /** null while loading. */
    queue: readonly QueuedSubmission[] | null;
    message: string;
    onReview: (reactionSlug: string) => void;
    now?: Date;
  } = $props();

  const KIND_TO_PILL = { newReaction: "new", nextVersion: "", resubmitted: "warn" } as const;
</script>

<h2 class="mt2">Waiting for review</h2>
{#if message !== ""}
  <p class="small message good" role="status">{message}</p>
{/if}
<section class="card flat queue" aria-label="Waiting for review">
  {#if queue === null}
    <p class="small muted">Loading…</p>
  {:else if queue.length === 0}
    <p class="small muted">Nothing is waiting for review.</p>
  {/if}
  {#each queue ?? [] as entry (entry.reactionSlug)}
    <div class="item">
      <div class="grow">
        <b>{entry.title ?? entry.reactionSlug}</b>
        {#if entry.reactionVersion > 1}
          · version {entry.reactionVersion}
        {/if}
        <div class="small muted">{queueLine(entry, now)}</div>
      </div>
      <span class={`pill ${KIND_TO_PILL[entry.queueKind]}`}>
        {QUEUE_KIND_TO_LABEL[entry.queueKind]}
      </span>
      <button
        class="btn sm primary"
        aria-label={`Review ${entry.title ?? entry.reactionSlug}`}
        onclick={() => {
          onReview(entry.reactionSlug);
        }}
      >
        Review
      </button>
    </div>
  {/each}
</section>
<p class="small muted">Oldest first. A reviewer can't review their own submission.</p>
