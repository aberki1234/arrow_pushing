<script lang="ts">
  // The reviewer's notes at the top of the Publish stage while changes are requested
  // (docs/SPEC.md §6, "Contributors"): the overall note, and each pinned note with "Go there →"
  // to the place it is about (reactionEditing/versionChanges.placeOfChangeKey).
  import { placeOfChangeKey, versionChanges } from "../reactionEditing/versionChanges.js";
  import type { ReviewNotes } from "./contributorClient.js";
  import { currentDraft, type EditorSession, goToPlace } from "./editorSession.js";

  const {
    session,
    update,
    notes,
  }: {
    session: EditorSession;
    update: (next: EditorSession) => void;
    notes: ReviewNotes;
  } = $props();

  const document = $derived(currentDraft(session));
  const keyToHeading = $derived(
    new Map(versionChanges(null, document).map((change) => [change.changeKey, change.heading])),
  );
</script>

<section class="card" aria-label="Reviewer's notes">
  <h3>Reviewer's notes</h3>
  {#if notes.comment !== null}
    <div class="comment">
      <small>{notes.reviewerName} — overall</small>
      {notes.comment}
    </div>
  {/if}
  {#each notes.pinnedNotes as pinned, position (position)}
    <div class="comment">
      <small>
        {notes.reviewerName} — on “{keyToHeading.get(pinned.changeKey) ?? pinned.changeKey}” ·
        <button
          class="linklike"
          onclick={() => {
            update(goToPlace(session, placeOfChangeKey(document, pinned.changeKey)));
          }}
        >
          Go there →
        </button>
      </small>
      {pinned.note}
    </div>
  {/each}
  <p class="small muted">Notes stay here until you submit again.</p>
</section>
