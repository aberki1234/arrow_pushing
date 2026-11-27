<script lang="ts">
  // The selected state's saved wrong answers (misconceptions, tried in order; the first match
  // wins) and "right so far" messages (partial progress). New ones are drawn (WrongAnswers.svelte);
  // the pattern, id and tag sit under "Match more than this exact drawing".
  import {
    moveMisconception,
    removeMisconception,
    removePartialProgressMessage,
    updateMisconception,
  } from "../reactionEditing/teaching/drawnAnswers.js";
  import { type ReactionDocument, statesOf } from "../reactionEditing/draft/reactionDraft.js";

  type Edit = ReturnType<typeof updateMisconception>;
  interface Misconception {
    misconceptionId: string;
    misconceptionTag?: string;
    severity: string;
    arrowPattern: string;
    feedbackMessage: string;
  }

  const {
    document,
    stateId,
    apply,
  }: { document: ReactionDocument; stateId: string; apply: (edit: Edit) => void } = $props();

  const state = $derived((statesOf(document)[stateId] ?? {}) as Record<string, unknown>);
  const misconceptions = $derived(
    (Array.isArray(state.misconceptions) ? state.misconceptions : []) as Misconception[],
  );
  const partialMessages = $derived(
    (Array.isArray(state.partialProgressMessages) ? state.partialProgressMessages : []) as {
      learnerArrows: string[];
      feedbackMessage: string;
    }[],
  );

  function change(misconceptionId: string, key: string, value: string): void {
    apply(updateMisconception(document, stateId, misconceptionId, { [key]: value }));
  }
</script>

<h3 class="mt">Saved wrong answers</h3>
{#if misconceptions.length === 0}
  <p class="small muted">None yet.</p>
{/if}
{#each misconceptions as entry, position (entry.misconceptionId)}
  <fieldset class="card flat" aria-label={`Wrong answer ${entry.misconceptionId}`}>
    <textarea
      aria-label="Message the learner sees"
      rows="2"
      value={entry.feedbackMessage}
      onchange={(event) => {
        change(entry.misconceptionId, "feedbackMessage", event.currentTarget.value);
      }}></textarea>
    <div class="row">
      <select
        aria-label="How wrong"
        value={entry.severity}
        onchange={(event) => {
          change(entry.misconceptionId, "severity", event.currentTarget.value);
        }}
      >
        <option value="wrong">wrong</option>
        <option value="plausible">plausible, not this reaction</option>
      </select>
      <button
        class="btn sm"
        disabled={position === 0}
        title="Tried in order: the first match wins"
        onclick={() => {
          apply(moveMisconception(document, stateId, entry.misconceptionId, -1));
        }}
      >
        Up
      </button>
      <button
        class="btn sm"
        disabled={position === misconceptions.length - 1}
        onclick={() => {
          apply(moveMisconception(document, stateId, entry.misconceptionId, 1));
        }}
      >
        Down
      </button>
      <button
        class="btn sm"
        onclick={() => {
          apply(removeMisconception(document, stateId, entry.misconceptionId));
        }}
      >
        Remove
      </button>
    </div>
    <details class="adv">
      <summary>Match more than this exact drawing</summary>
      <input
        aria-label="Arrow pattern"
        class="mono"
        value={entry.arrowPattern}
        onchange={(event) => {
          change(entry.misconceptionId, "arrowPattern", event.currentTarget.value);
        }}
      />
      <input
        aria-label="Id"
        value={entry.misconceptionId}
        onchange={(event) => {
          change(entry.misconceptionId, "misconceptionId", event.currentTarget.value);
        }}
      />
      <input
        aria-label="Tag (groups wrong answers on the progress page)"
        placeholder="tag"
        value={entry.misconceptionTag ?? ""}
        onchange={(event) => {
          change(entry.misconceptionId, "misconceptionTag", event.currentTarget.value);
        }}
      />
      <p class="small muted">Atom roles for patterns (@role) are on Publish → Advanced.</p>
    </details>
  </fieldset>
{/each}

{#if partialMessages.length > 0}
  <h3 class="mt">"Right so far" messages</h3>
{/if}
{#each partialMessages as entry, position (position)}
  <div class="row">
    <span class="small">
      <code>{entry.learnerArrows.join("; ")}</code> → {entry.feedbackMessage}
    </span>
    <button
      class="btn sm"
      aria-label="Remove partial progress message"
      onclick={() => {
        apply(removePartialProgressMessage(document, stateId, position));
      }}
    >
      ✕
    </button>
  </div>
{/each}
