<script lang="ts">
  // The selected step: its key, route preference, explanation (shown after a correct check),
  // caption (a change step's event text) and other complete arrow sets.
  import { removePartialArrowSet } from "../reactionEditing/drawnAnswers.js";
  import { renameStep, setRoutePreference, setStepField } from "../reactionEditing/fieldEdits.js";
  import { type ReactionDocument, stepsOf } from "../reactionEditing/reactionDraft.js";

  type Edit = ReturnType<typeof setStepField>;

  const {
    document,
    stepKey,
    apply,
  }: { document: ReactionDocument; stepKey: string; apply: (edit: Edit) => void } = $props();

  const step = $derived(stepsOf(document).find((candidate) => candidate.stepKey === stepKey) ?? {});
  const textOf = (key: string): string => (typeof step[key] === "string" ? step[key] : "");
  const partialSets = $derived(
    (Array.isArray(step.partialArrowSets) ? step.partialArrowSets : []) as string[][],
  );
  const arrows = $derived(
    Array.isArray(step.canonicalArrows) ? step.canonicalArrows.map(String) : [],
  );
</script>

<section class="card" aria-label={`Step ${stepKey}`}>
  <h3>Step {stepKey}</h3>
  <p class="small muted">{textOf("fromStateId")} → {textOf("toStateId")} · {textOf("stepKind")}</p>
  <label class="small" for="step-key">Step key</label>
  <input
    id="step-key"
    value={stepKey}
    onchange={(event) => {
      apply(renameStep(document, stepKey, event.currentTarget.value.trim()));
    }}
  />
  <label class="small" for="route">Route</label>
  <select
    id="route"
    value={textOf("routePreference")}
    onchange={(event) => {
      apply(
        setRoutePreference(
          document,
          stepKey,
          event.currentTarget.value === "preferred" ? "preferred" : "accepted",
        ),
      );
    }}
  >
    <option value="preferred">
      preferred (the textbook route: hints and the reveal follow it)
    </option>
    <option value="accepted">accepted (also correct)</option>
  </select>
  {#if arrows.length > 0}
    <p class="small">Canonical arrows: <code>{arrows.join("; ")}</code></p>
  {/if}
  <label class="small" for="explanation">Explanation after the step</label>
  <textarea
    id="explanation"
    rows="3"
    value={textOf("explanationAfterStep")}
    onchange={(event) => {
      apply(setStepField(document, stepKey, "explanationAfterStep", event.currentTarget.value));
    }}></textarea>
  <label class="small" for="step-caption">Caption (a change step's event text)</label>
  <input
    id="step-caption"
    value={textOf("caption")}
    onchange={(event) => {
      apply(setStepField(document, stepKey, "caption", event.currentTarget.value));
    }}
  />
  <h3 class="mt">Other complete arrow sets</h3>
  {#if partialSets.length === 0}
    <p class="small muted">
      None: draw another arrow set on {textOf("fromStateId")}, then "Save as another arrow set".
    </p>
  {/if}
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
</section>
