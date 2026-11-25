<script lang="ts">
  // One Teaching item, open: the question the learner sees, the hint ladder, why a step happens,
  // a change step's caption, the summary, or the common wrong answers (drawn on the state, then
  // given a message). Lint findings at the item are shown with it.
  import { setReactionField, setStateField, setStepField } from "../reactionEditing/fieldEdits.js";
  import { statesOf, stepsOf } from "../reactionEditing/reactionDraft.js";
  import type { TeachingItem } from "../reactionEditing/teachingChecklist.js";
  import { teachingItemLabel } from "./createView.js";
  import { applyDocumentEdit, currentDraft, type EditorSession } from "./editorSession.js";
  import { draftDrawing } from "./editorView.js";
  import StateThumbnail from "./StateThumbnail.svelte";
  import WrongAnswers from "./WrongAnswers.svelte";

  const {
    session,
    update,
    item,
  }: {
    session: EditorSession;
    update: (next: EditorSession) => void;
    item: TeachingItem;
  } = $props();

  const PROMPT_SUGGESTIONS = [
    "Draw the arrows for the next step.",
    "Draw the arrows for the single, concerted step.",
  ];
  const HINT_TIERS = [
    { label: "1 · Nudge", note: "", placeholder: "Which atom is electron-poor?" },
    {
      label: "2 · Narrower",
      note: "optional",
      placeholder: "Which bond breaks as it is attacked?",
    },
    { label: "3 · Answer", note: "+ ghost arrows", placeholder: "The arrows, in a sentence." },
  ];

  const document = $derived(currentDraft(session));
  const place = $derived(item.place);
  const state = $derived(
    (place.placeKind === "state" ? (statesOf(document)[place.stateId] ?? {}) : {}) as Record<
      string,
      unknown
    >,
  );
  const step = $derived(
    place.placeKind === "step"
      ? (stepsOf(document).find((candidate) => candidate.stepKey === place.stepKey) ?? {})
      : {},
  );
  const hintTiers = $derived(Array.isArray(state.hintTiers) ? state.hintTiers.map(String) : []);
  const textIn = (record: Readonly<Record<string, unknown>>, key: string): string =>
    typeof record[key] === "string" ? record[key] : "";

  function apply(edit: Parameters<typeof applyDocumentEdit>[1]): void {
    update(applyDocumentEdit(session, edit));
  }

  function setStateText(key: string, value: unknown): void {
    if (place.placeKind === "state") {
      apply(setStateField(document, place.stateId, key, value));
    }
  }

  function setStepText(key: string, value: string): void {
    if (place.placeKind === "step") {
      apply(setStepField(document, place.stepKey, key, value));
    }
  }

  /** The three tiers, with empty ones at the end left out. */
  function setHintTier(position: number, text: string): void {
    const tiers = [0, 1, 2].map((index) => (index === position ? text : (hintTiers[index] ?? "")));
    while (tiers.length > 0 && (tiers.at(-1) ?? "").trim() === "") {
      tiers.pop();
    }
    setStateText("hintTiers", tiers);
  }
</script>

<h3>{teachingItemLabel(document, item)}</h3>
{#if item.lintFindings.length > 0}
  <ul class="small findings">
    {#each item.lintFindings as finding, position (position)}
      <li class={finding.lintLevel === "error" ? "message bad" : "message warn"}>
        {finding.message}
      </li>
    {/each}
  </ul>
{/if}
{#if item.itemKind === "misconceptions"}
  <WrongAnswers {session} {update} />
{:else}
  <div class="with-picture">
    {#if place.placeKind !== "reaction"}
      <div class="card flat picture">
        <StateThumbnail drawing={draftDrawing(document, session.selectedStateId).drawing} />
      </div>
    {/if}
    <div class="grow">
      {#if item.itemKind === "learnerPrompt"}
        <label class="f" for="teach-prompt">What does the learner see before drawing?</label>
        <textarea
          id="teach-prompt"
          data-field="learnerPrompt"
          rows="3"
          value={textIn(state, "learnerPrompt")}
          placeholder="e.g. Draw the arrows for the single, concerted step."
          onchange={(event) => {
            setStateText("learnerPrompt", event.currentTarget.value);
          }}></textarea>
        <div class="row small muted">
          Suggestions:
          {#each PROMPT_SUGGESTIONS as suggestion (suggestion)}
            <button
              class="chip"
              onclick={() => {
                setStateText("learnerPrompt", suggestion);
              }}
            >
              {suggestion}
            </button>
          {/each}
        </div>
      {:else if item.itemKind === "hintTiers"}
        <p class="small muted">
          One is needed; three make the best ladder. The third also shows your arrows as dashed
          ghost arrows for the learner to trace.
        </p>
        {#each HINT_TIERS as tier, position (tier.label)}
          <div class="tier" data-field={position === 0 ? "hintTiers" : undefined}>
            <label class="lab" for={`hint-${String(position)}`}>
              {tier.label}<small>{tier.note}</small>
            </label>
            <textarea
              id={`hint-${String(position)}`}
              rows="2"
              value={hintTiers[position] ?? ""}
              placeholder={tier.placeholder}
              onchange={(event) => {
                setHintTier(position, event.currentTarget.value);
              }}></textarea>
          </div>
        {/each}
      {:else if item.itemKind === "explanationAfterStep"}
        <label class="f" for="teach-why">Shown after a correct step</label>
        <textarea
          id="teach-why"
          data-field="explanationAfterStep"
          rows="4"
          value={textIn(step, "explanationAfterStep")}
          onchange={(event) => {
            setStepText("explanationAfterStep", event.currentTarget.value);
          }}></textarea>
      {:else if item.itemKind === "caption"}
        <label class="f" for="teach-caption">What the learner reads as the molecules change</label>
        <input
          id="teach-caption"
          data-field="caption"
          value={textIn(step, "caption")}
          onchange={(event) => {
            setStepText("caption", event.currentTarget.value);
          }}
        />
      {:else}
        <label class="f" for="teach-summary">Shown when the learner finishes</label>
        <textarea
          id="teach-summary"
          data-field="mechanismSummary"
          rows="3"
          value={textIn(document, "mechanismSummary")}
          placeholder="e.g. One concerted step; inversion of configuration at carbon."
          onchange={(event) => {
            apply(setReactionField(document, "mechanismSummary", event.currentTarget.value));
          }}></textarea>
      {/if}
    </div>
  </div>
{/if}
