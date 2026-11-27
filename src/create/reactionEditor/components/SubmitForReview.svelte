<script lang="ts">
  // The Publish stage's last card for anyone who submits rather than publishes (docs/SPEC.md §6,
  // "Contributors"): the licence tick, an optional note for the reviewer, Submit for review.
  // The reviewer's notes are at the top of the stage (ReviewerNotes.svelte).
  import type { SubmitControls } from "../model/reviewView.js";

  const {
    submitting,
    onDownload,
  }: {
    submitting: SubmitControls;
    onDownload: () => void;
  } = $props();

  let licenceAgreed = $state(false);
  let submissionNote = $state("");
  const inReview = $derived(submitting.submissionStatus === "submitted");
</script>

<section class="card mt" aria-label="Submit for review">
  {#if inReview}
    <p class="small message good" role="status">
      In review: a reviewer will play it through and compare it with the last version. You can keep
      editing; that takes it out of review.
    </p>
  {/if}
  <label class="row small">
    <input type="checkbox" bind:checked={licenceAgreed} />
    I share this under CC BY-SA 4.0, with my name shown on the reaction (needed once)
  </label>
  <label class="f" for="submission-note">
    Note for the reviewer <span class="optional">optional</span>
  </label>
  <textarea
    id="submission-note"
    rows="2"
    maxlength="4000"
    placeholder="e.g. Clearer hint 2; added the leaving-group mistake."
    bind:value={submissionNote}></textarea>
  <p class="small muted">
    A reviewer plays it through and compares it with the last version before learners see it.
  </p>
  <div class="row spread mt">
    <button class="btn sm" onclick={onDownload}>Download the JSON file</button>
    <button
      class="btn primary"
      title="Save, then submit: the server checks the draft first"
      onclick={() => {
        submitting.onSubmit(licenceAgreed, submissionNote);
      }}
    >
      {inReview ? "Submit again" : "Submit for review"}
    </button>
  </div>
</section>
