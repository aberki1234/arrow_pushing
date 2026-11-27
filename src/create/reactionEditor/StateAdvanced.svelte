<script lang="ts">
  // The selected state's rarely needed settings on the Mechanism stage: its id (renamed
  // everywhere), the caption under its drawing, and notes on atoms (annotations).
  import { renameState, setStateField } from "../reactionEditing/fieldEdits.js";
  import { type ReactionDocument, statesOf } from "../reactionEditing/reactionDraft.js";
  import { annotationsText, readAnnotations } from "./fieldText.js";

  type Edit = ReturnType<typeof setStateField>;

  const {
    document,
    stateId,
    apply,
  }: { document: ReactionDocument; stateId: string; apply: (edit: Edit) => void } = $props();

  const state = $derived((statesOf(document)[stateId] ?? {}) as Record<string, unknown>);
  const annotations = $derived(
    (Array.isArray(state.annotations) ? state.annotations : []) as {
      text: string;
      nearMapNumber: number;
    }[],
  );
</script>

<details class="adv">
  <summary>Advanced: this state</summary>
  <label class="f" for="state-id">State id (in the file)</label>
  <input
    id="state-id"
    data-field="stateId"
    value={stateId}
    onchange={(event) => {
      apply(renameState(document, stateId, event.currentTarget.value.trim()));
    }}
  />
  <label class="f" for="state-caption">Caption under the drawing</label>
  <input
    id="state-caption"
    data-field="caption"
    value={typeof state.caption === "string" ? state.caption : ""}
    onchange={(event) => {
      apply(setStateField(document, stateId, "caption", event.currentTarget.value));
    }}
  />
  <label class="f" for="annotations">Notes on atoms (text @ atom number, one per line)</label>
  <textarea
    id="annotations"
    data-field="annotations"
    rows="2"
    value={annotationsText(annotations)}
    onchange={(event) => {
      const read = readAnnotations(event.currentTarget.value);
      apply(
        "reason" in read
          ? { outcome: "refused", reason: read.reason }
          : setStateField(document, stateId, "annotations", read.value),
      );
    }}></textarea>
</details>
