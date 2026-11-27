<script lang="ts">
  // The selected step on the Mechanism stage: why it happens (shown after a correct check),
  // another step from its result or another correct route from its start, and under Advanced
  // its key, route preference, other complete arrow sets and deletion.
  import { removePartialArrowSet } from "../reactionEditing/teaching/drawnAnswers.js";
  import {
    renameStep,
    setRoutePreference,
    setStepField,
  } from "../reactionEditing/draft/fieldEdits.js";
  import { type ReactionDocument, stepsOf } from "../reactionEditing/draft/reactionDraft.js";
  import { stateDisplayNames } from "../reactionEditing/outline/stateStrip.js";

  type Edit = ReturnType<typeof setStepField>;

  const {
    document,
    stepKey,
    apply,
    onSelectState,
    onAnotherRoute,
    onDelete,
    onSaveArrowSet,
    canSaveArrowSet,
  }: {
    document: ReactionDocument;
    stepKey: string;
    apply: (edit: Edit) => void;
    onSelectState: (stateId: string) => void;
    onAnotherRoute: (fromStateId: string) => void;
    onDelete: (stepKey: string) => void;
    onSaveArrowSet: () => void;
    canSaveArrowSet: boolean;
  } = $props();

  const step = $derived(stepsOf(document).find((candidate) => candidate.stepKey === stepKey) ?? {});
  const names = $derived(stateDisplayNames(document));
  const textOf = (key: string): string => (typeof step[key] === "string" ? step[key] : "");
  const nameOf = (stateId: string): string => names.get(stateId) ?? stateId;
  const isChange = $derived(step.stepKind === "change");
  const partialSets = $derived(
    (Array.isArray(step.partialArrowSets) ? step.partialArrowSets : []) as string[][],
  );
</script>

<section class="card flat" aria-label="Selected step">
  <div class="small muted">
    {isChange ? "Molecules change" : "Step"}: {nameOf(textOf("fromStateId"))} → {nameOf(
      textOf("toStateId"),
    )}
  </div>
  {#if isChange}
    <label class="f" for="step-caption">What happens (caption the learner sees)</label>
    <input
      id="step-caption"
      data-field="caption"
      value={textOf("caption")}
      onchange={(event) => {
        apply(setStepField(document, stepKey, "caption", event.currentTarget.value));
      }}
    />
  {:else}
    <label class="f" for="step-why">
      Why does this step happen? <span class="optional">also on Teaching</span>
    </label>
    <textarea
      id="step-why"
      data-field="explanationAfterStep"
      rows="3"
      value={textOf("explanationAfterStep")}
      placeholder="e.g. Hydroxide attacks the δ+ carbon from the back as bromide leaves."
      onchange={(event) => {
        apply(setStepField(document, stepKey, "explanationAfterStep", event.currentTarget.value));
      }}></textarea>
  {/if}
  <div class="row mt">
    <button
      class="btn sm"
      onclick={() => {
        onSelectState(textOf("toStateId"));
      }}
    >
      + Another step from {nameOf(textOf("toStateId"))}
    </button>
    {#if !isChange}
      <button
        class="btn sm"
        onclick={() => {
          onAnotherRoute(textOf("fromStateId"));
        }}
      >
        ⑂ Another correct route
      </button>
    {/if}
  </div>
  <details class="adv mt">
    <summary>Advanced</summary>
    <label class="f" for="step-key">Step key (learner progress records it)</label>
    <input
      id="step-key"
      data-field="stepKey"
      value={stepKey}
      onchange={(event) => {
        apply(renameStep(document, stepKey, event.currentTarget.value.trim()));
      }}
    />
    {#if !isChange}
      <label class="f" for="step-route">Route</label>
      <select
        id="step-route"
        data-field="routePreference"
        value={textOf("routePreference")}
        onchange={(event) => {
          const preference = event.currentTarget.value === "preferred" ? "preferred" : "accepted";
          apply(setRoutePreference(document, stepKey, preference));
        }}
      >
        <option value="preferred">preferred (the textbook route: hints follow it)</option>
        <option value="accepted">accepted (also correct)</option>
      </select>
      <p class="f" data-field="partialArrowSets">
        Other complete arrow sets ("right so far" is recognised for them)
      </p>
      {#each partialSets as arrowSet, position (position)}
        <div class="row">
          <code class="small">{arrowSet.join("; ")}</code>
          <button
            class="btn sm"
            aria-label="Remove arrow set"
            onclick={() => {
              apply(removePartialArrowSet(document, stepKey, position));
            }}
          >
            ✕
          </button>
        </div>
      {/each}
      <button class="btn sm" disabled={!canSaveArrowSet} onclick={onSaveArrowSet}>
        Save the drawn arrows as another set
      </button>
    {/if}
    <div class="mt">
      <button
        class="btn sm"
        onclick={() => {
          onDelete(stepKey);
        }}
      >
        Delete this step
      </button>
    </div>
  </details>
</section>
