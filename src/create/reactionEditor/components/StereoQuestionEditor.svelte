<script lang="ts">
  // Create's stereo question for one step (docs/stereo-question.md; prototype
  // mockups/stereo-choice/author.html): ask or not, either enantiomer, the arrangements to
  // explain (tapped like the learner taps), the racemic-mixture answer, and the message for
  // any other arrangement. Its problems are the lint findings TeachingItemPane shows above it.
  import MoleculeCanvas from "../../../learner/learnerSite/components/MoleculeCanvas.svelte";
  import type { StereoQuestion } from "../../../core/reactionFiles/reactionFile.js";
  import { DEFAULT_OTHER_ARRANGEMENT_MESSAGE } from "../../../core/stereoQuestions/stereoQuestions.js";
  import type { FieldEdit } from "../../reactionEditing/draft/fieldEdits.js";
  import type { ReactionDocument } from "../../reactionEditing/draft/reactionDraft.js";
  import {
    addArrangement,
    arrangementDrawing,
    canAcceptEnantiomer,
    setStereoQuestion,
    startStereoQuestion,
    stereoQuestionOf,
    tapArrangement,
  } from "../../reactionEditing/teaching/stereoQuestionAuthoring.js";

  const {
    document,
    stepKey,
    pixelsPerUnit,
    apply,
  }: {
    document: ReactionDocument;
    stepKey: string;
    pixelsPerUnit: number;
    apply: (edit: FieldEdit) => void;
  } = $props();

  const question = $derived(stereoQuestionOf(document, stepKey));
  const enantiomerPossible = $derived(canAcceptEnantiomer(document, stepKey));
  const rightAnswer = $derived(arrangementDrawing(document, stepKey, null, pixelsPerUnit));

  function change(next: StereoQuestion): void {
    apply(setStereoQuestion(document, stepKey, next));
  }

  function withArrangement(
    current: StereoQuestion,
    index: number,
    fields: Partial<StereoQuestion["otherArrangements"][number]>,
  ): StereoQuestion {
    return {
      ...current,
      otherArrangements: current.otherArrangements.map((entry, position) =>
        position === index ? { ...entry, ...fields } : entry,
      ),
    };
  }

  function withoutOptional(
    current: StereoQuestion,
    key: "racemicMixture" | "otherArrangementMessage",
  ): StereoQuestion {
    return Object.fromEntries(
      Object.entries(current).filter(([entryKey]) => entryKey !== key),
    ) as unknown as StereoQuestion;
  }
</script>

<label class="choice">
  <input
    type="checkbox"
    data-field="stereoQuestion"
    checked={question !== null}
    onchange={(event) => {
      apply(
        event.currentTarget.checked
          ? startStereoQuestion(document, stepKey)
          : setStereoQuestion(document, stepKey, null),
      );
    }}
  />
  After correct arrows, ask the learner to draw the product's stereochemistry
</label>

{#if question !== null}
  <div class="arrangement card flat">
    <p class="small"><strong>Right answer</strong>: the product as drawn in the mechanism.</p>
    <MoleculeCanvas
      drawing={rightAnswer.drawing}
      arrows={[]}
      interactive={false}
      selectedTargetId={null}
      onPick={() => undefined}
    />
  </div>

  <label class="choice small">
    <input
      type="checkbox"
      checked={question.acceptEnantiomer}
      disabled={!enantiomerPossible && !question.acceptEnantiomer}
      onchange={(event) => {
        change({ ...question, acceptEnantiomer: event.currentTarget.checked });
      }}
    />
    Either enantiomer counts (its mirror image is right too)
  </label>
  {#if !enantiomerPossible}
    <p class="small muted">
      Not possible here: the product has a stereocentre this step does not set, so the mirror image
      of the new centres is a diastereomer.
    </p>
  {/if}

  <h4>Arrangements to explain</h4>
  {#each question.otherArrangements as arrangement, index (index)}
    {@const drawn = arrangementDrawing(document, stepKey, index, pixelsPerUnit)}
    <div class="arrangement card flat">
      <MoleculeCanvas
        drawing={drawn.drawing}
        arrows={[]}
        interactive={false}
        selectedTargetId={null}
        onPick={() => undefined}
      >
        {#snippet overlay()}
          {#each drawn.targets as target (target.targetId)}
            <g
              class="question-target"
              class:set={target.isSet}
              role="button"
              tabindex="0"
              aria-label={`Arrangement ${String(index + 1)}, ${target.accessibleName}`}
              onclick={() => {
                apply(tapArrangement(document, stepKey, index, target.targetId));
              }}
              onkeydown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  apply(tapArrangement(document, stepKey, index, target.targetId));
                }
              }}
            >
              <circle cx={target.point.x} cy={target.point.y} r="17" />
            </g>
          {/each}
        {/snippet}
      </MoleculeCanvas>
      <p class="small muted">Tap a highlighted centre: a wedge, then a dash.</p>
      <div class="choices small">
        <label class="choice">
          <input
            type="radio"
            name={`severity-${String(index)}`}
            checked={arrangement.severity === "wrong"}
            onchange={() => {
              change(withArrangement(question, index, { severity: "wrong" }));
            }}
          /> Wrong
        </label>
        <label class="choice">
          <input
            type="radio"
            name={`severity-${String(index)}`}
            checked={arrangement.severity === "plausible"}
            onchange={() => {
              change(withArrangement(question, index, { severity: "plausible" }));
            }}
          /> Plausible, but not the major product
        </label>
      </div>
      <textarea
        rows="2"
        aria-label={`What the learner is told for arrangement ${String(index + 1)}`}
        placeholder="Why this arrangement is not the product."
        value={arrangement.feedbackMessage}
        onchange={(event) => {
          change(withArrangement(question, index, { feedbackMessage: event.currentTarget.value }));
        }}></textarea>
      <button
        type="button"
        class="btn small"
        onclick={() => {
          change({
            ...question,
            otherArrangements: question.otherArrangements.filter(
              (unusedEntry, position) => position !== index,
            ),
          });
        }}
      >
        Remove
      </button>
    </div>
  {/each}
  <button
    type="button"
    class="btn"
    onclick={() => {
      apply(addArrangement(document, stepKey));
    }}
  >
    + Add an arrangement
  </button>

  <h4>Racemic mixture</h4>
  <label class="choice small">
    <input
      type="checkbox"
      checked={question.racemicMixture !== undefined}
      onchange={(event) => {
        change(
          event.currentTarget.checked
            ? { ...question, racemicMixture: { isRight: false, feedbackMessage: "" } }
            : withoutOptional(question, "racemicMixture"),
        );
      }}
    />
    Offer "both enantiomers form, 50 : 50"
  </label>
  {#if question.racemicMixture !== undefined}
    {@const racemic = question.racemicMixture}
    <div class="choices small">
      <label class="choice">
        <input
          type="radio"
          name="racemic-is-right"
          checked={racemic.isRight}
          onchange={() => {
            change({ ...question, racemicMixture: { ...racemic, isRight: true } });
          }}
        /> It is the answer (e.g. SN1)
      </label>
      <label class="choice">
        <input
          type="radio"
          name="racemic-is-right"
          checked={!racemic.isRight}
          onchange={() => {
            change({ ...question, racemicMixture: { ...racemic, isRight: false } });
          }}
        /> A wrong answer
      </label>
    </div>
    <textarea
      rows="2"
      aria-label="What the learner is told on choosing the racemic mixture"
      value={racemic.feedbackMessage}
      onchange={(event) => {
        change({
          ...question,
          racemicMixture: { ...racemic, feedbackMessage: event.currentTarget.value },
        });
      }}></textarea>
  {/if}

  <h4>Any other arrangement</h4>
  <textarea
    rows="2"
    aria-label="What the learner is told for an arrangement not listed"
    placeholder={DEFAULT_OTHER_ARRANGEMENT_MESSAGE}
    value={question.otherArrangementMessage ?? ""}
    onchange={(event) => {
      const text = event.currentTarget.value.trim();
      change(
        text === ""
          ? withoutOptional(question, "otherArrangementMessage")
          : { ...question, otherArrangementMessage: text },
      );
    }}></textarea>
{/if}

<style>
  .choice {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    margin: 6px 0;
  }
  .choice input {
    width: auto;
    margin: 3px 0 0;
  }
  .choices {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  .arrangement {
    margin: 8px 0;
    max-width: 420px;
  }
  textarea {
    width: 100%;
  }
  .question-target circle {
    fill: var(--accent);
    fill-opacity: 0.14;
    stroke: var(--accent);
    stroke-width: 2;
    stroke-dasharray: 4 3;
    cursor: pointer;
  }
  .question-target.set circle {
    fill-opacity: 0.04;
    stroke-dasharray: none;
  }
</style>
