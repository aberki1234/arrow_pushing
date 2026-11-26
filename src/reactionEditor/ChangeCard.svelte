<script lang="ts">
  // One change on the review screen (reactionEditing/versionChanges.ts): its text with deletions
  // and insertions; a changed structure as before / after drawings; a wrong answer drawn with its
  // arrows. "✎ Note" pins the reviewer's note to it.
  import type { ReactionDocument } from "../reactionEditing/reactionDraft.js";
  import { statesOf } from "../reactionEditing/reactionDraft.js";
  import type { VersionChange } from "../reactionEditing/versionChanges.js";
  import ReviewDrawing from "./ReviewDrawing.svelte";

  const {
    change,
    submitted,
    previous,
    note,
    onNote,
  }: {
    change: VersionChange;
    submitted: ReactionDocument;
    previous: ReactionDocument | null;
    note: string;
    onNote: (note: string) => void;
  } = $props();

  const KIND_TO_PILL = {
    added: { text: "New", pillClass: "good" },
    removed: { text: "Removed", pillClass: "warn" },
    changed: { text: "Changed", pillClass: "new" },
  } as const;

  let noteOpen = $state(false);
  const pill = $derived(KIND_TO_PILL[change.changeKind]);
  const noteShown = $derived(noteOpen || note !== "");
  const drawsWrongAnswer = $derived(
    change.entryKind === "misconception" && change.changeKind !== "removed",
  );

  function hasState(document: ReactionDocument | null, stateId: string): boolean {
    return document !== null && stateId in statesOf(document);
  }

  /** The wrong answer's arrow pattern in `document`, for its drawing. */
  function patternIn(document: ReactionDocument): string {
    const state = statesOf(document)[change.stateId ?? ""] as Record<string, unknown> | undefined;
    const misconceptions = Array.isArray(state?.misconceptions) ? state.misconceptions : [];
    const found = (misconceptions as Record<string, unknown>[]).find(
      (misconception) => misconception.misconceptionId === change.misconceptionId,
    );
    return typeof found?.arrowPattern === "string" ? found.arrowPattern : "";
  }
</script>

<article class="change" aria-label={change.heading}>
  <header>
    <h4>{change.heading}</h4>
    <span class="row">
      <span class={`pill ${pill.pillClass}`}>{pill.text}</span>
      <button
        class="btn sm"
        aria-label={`Note on ${change.heading}`}
        onclick={() => {
          noteOpen = !noteOpen;
        }}
      >
        ✎ Note
      </button>
    </span>
  </header>
  {#if change.entryKind === "structure" && change.stateId !== null}
    <div class="pair">
      {#if previous !== null && hasState(previous, change.stateId)}
        <ReviewDrawing document={previous} stateId={change.stateId} caption="Before" />
      {/if}
      {#if hasState(submitted, change.stateId)}
        <ReviewDrawing document={submitted} stateId={change.stateId} caption="After" />
      {/if}
    </div>
  {:else if drawsWrongAnswer && change.stateId !== null}
    <div class="pair">
      <ReviewDrawing
        document={submitted}
        stateId={change.stateId}
        arrowPattern={patternIn(submitted)}
        caption="The wrong answer"
      />
    </div>
  {/if}
  <p class="difftext">
    {#each change.textPieces as piece, position (position)}
      {#if piece.pieceKind === "deleted"}<del>
          {piece.text}
        </del>{:else if piece.pieceKind === "inserted"}<ins>
          {piece.text}
        </ins>{:else}{piece.text}{/if}
    {/each}
  </p>
  {#if noteShown}
    <label class="f" for={`note-${change.changeKey}`}>Your note</label>
    <textarea
      id={`note-${change.changeKey}`}
      rows="2"
      maxlength="4000"
      value={note}
      oninput={(event) => {
        onNote(event.currentTarget.value);
      }}></textarea>
  {/if}
</article>
