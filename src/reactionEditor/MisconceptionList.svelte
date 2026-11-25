<script lang="ts">
  // The selected state's misconceptions (tried in order; the first match wins) and partial
  // progress messages. New ones are drawn on the canvas and saved from the drawing panel.
  import {
    moveMisconception,
    removeMisconception,
    removePartialProgressMessage,
    updateMisconception,
  } from "../reactionEditing/drawnAnswers.js";
  import { type ReactionDocument, statesOf } from "../reactionEditing/reactionDraft.js";

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

<h3 class="mt">Misconceptions</h3>
{#if misconceptions.length === 0}
  <p class="small muted">None yet: draw a wrong answer, then "Save as misconception".</p>
{/if}
{#each misconceptions as entry, position (entry.misconceptionId)}
  <fieldset class="card flat" aria-label={`Misconception ${entry.misconceptionId}`}>
    <div class="row">
      <input
        aria-label="Misconception id"
        value={entry.misconceptionId}
        onchange={(event) => {
          change(entry.misconceptionId, "misconceptionId", event.currentTarget.value);
        }}
      />
      <select
        aria-label="Severity"
        value={entry.severity}
        onchange={(event) => {
          change(entry.misconceptionId, "severity", event.currentTarget.value);
        }}
      >
        <option value="wrong">wrong</option>
        <option value="plausible">plausible</option>
      </select>
    </div>
    <input
      aria-label="Tag (groups misconceptions on the progress page)"
      placeholder="tag"
      value={entry.misconceptionTag ?? ""}
      onchange={(event) => {
        change(entry.misconceptionId, "misconceptionTag", event.currentTarget.value);
      }}
    />
    <input
      aria-label="Arrow pattern"
      value={entry.arrowPattern}
      onchange={(event) => {
        change(entry.misconceptionId, "arrowPattern", event.currentTarget.value);
      }}
    />
    <textarea
      aria-label="Feedback message"
      rows="2"
      value={entry.feedbackMessage}
      onchange={(event) => {
        change(entry.misconceptionId, "feedbackMessage", event.currentTarget.value);
      }}></textarea>
    <div class="row">
      <button
        class="btn sm"
        disabled={position === 0}
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
  </fieldset>
{/each}

<h3 class="mt">Partial progress messages</h3>
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
