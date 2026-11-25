<script lang="ts">
  // What the learner is told at the selected state: its id, prompt, caption, the three hint
  // tiers (conceptual, narrowing, reveal) and annotations. Saved when a field loses focus.
  import { renameState, setStateField } from "../reactionEditing/fieldEdits.js";
  import { type ReactionDocument, statesOf } from "../reactionEditing/reactionDraft.js";
  import { annotationsText, readAnnotations } from "./fieldText.js";

  type Edit = ReturnType<typeof setStateField>;

  const {
    document,
    stateId,
    apply,
  }: { document: ReactionDocument; stateId: string; apply: (edit: Edit) => void } = $props();

  const HINT_TIER_NAMES = [
    "Hint 1 (conceptual)",
    "Hint 2 (narrowing)",
    "Hint 3 (reveal; the arrows are also shown)",
  ];
  const state = $derived((statesOf(document)[stateId] ?? {}) as Record<string, unknown>);
  const textOf = (key: string): string => (typeof state[key] === "string" ? state[key] : "");
  const hintTiers = $derived(Array.isArray(state.hintTiers) ? state.hintTiers.map(String) : []);
  const annotations = $derived(
    (Array.isArray(state.annotations) ? state.annotations : []) as {
      text: string;
      nearMapNumber: number;
    }[],
  );

  function setField(key: string, value: unknown): void {
    apply(setStateField(document, stateId, key, value));
  }

  function setHintTier(position: number, text: string): void {
    const tiers = [0, 1, 2].map((index) => (index === position ? text : (hintTiers[index] ?? "")));
    setField("hintTiers", tiers);
  }

  function setAnnotations(text: string): void {
    const read = readAnnotations(text);
    apply(
      "reason" in read
        ? { outcome: "refused", reason: read.reason }
        : setStateField(document, stateId, "annotations", read.value),
    );
  }
</script>

<label class="small" for="state-id">State id</label>
<input
  id="state-id"
  value={stateId}
  onchange={(event) => {
    apply(renameState(document, stateId, event.currentTarget.value.trim()));
  }}
/>
<label class="small" for="prompt">Learner prompt</label>
<input
  id="prompt"
  value={textOf("learnerPrompt")}
  placeholder="Draw the arrows for the next step."
  onchange={(event) => {
    setField("learnerPrompt", event.currentTarget.value);
  }}
/>
<label class="small" for="caption">Caption under the drawing</label>
<input
  id="caption"
  value={textOf("caption")}
  onchange={(event) => {
    setField("caption", event.currentTarget.value);
  }}
/>
{#each HINT_TIER_NAMES as hintName, position (position)}
  <label class="small" for={`hint-${String(position)}`}>{hintName}</label>
  <textarea
    id={`hint-${String(position)}`}
    rows="2"
    value={hintTiers[position] ?? ""}
    onchange={(event) => {
      setHintTier(position, event.currentTarget.value);
    }}></textarea>
{/each}
<label class="small" for="annotations">Annotations (text @ map number)</label>
<textarea
  id="annotations"
  rows="2"
  value={annotationsText(annotations)}
  onchange={(event) => {
    setAnnotations(event.currentTarget.value);
  }}></textarea>
