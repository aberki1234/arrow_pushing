<script lang="ts">
  // The panels ⋯ More opens on the Mechanism stage: add a molecule (a change step), shorten a
  // bystander group to its label (abbreviated groups), or edit the state as mapped SMILES (then,
  // if asked, regenerate the states after it).
  import { setReactionField } from "../../reactionEditing/draft/fieldEdits.js";
  import type { ReactionDocument } from "../../reactionEditing/draft/reactionDraft.js";
  import { abbreviatedGroupsText, readAbbreviatedGroups } from "../model/fieldText.js";

  import type { MorePanelKind } from "../model/createView.js";

  type Edit = ReturnType<typeof setReactionField>;

  const {
    panelKind,
    document,
    stateName,
    mappedSmiles,
    apply,
    onAddChange,
    onApplySmiles,
    onClose,
  }: {
    panelKind: MorePanelKind;
    document: ReactionDocument;
    stateName: string;
    mappedSmiles: string;
    apply: (edit: Edit) => void;
    onAddChange: (pastedSmiles: string, removedMapNumbersText: string) => void;
    onApplySmiles: (mappedSmiles: string, regenerate: boolean) => void;
    onClose: () => void;
  } = $props();

  let arrivingSmiles = $state("");
  let leavingMapNumbers = $state("");
  // Starts as the state's SMILES (again whenever another state is shown); the author edits it.
  let editedSmiles = $derived(mappedSmiles);
  const groups = $derived(
    Array.isArray(document.abbreviatedGroups) ? document.abbreviatedGroups : [],
  );
</script>

<section class="card flat" aria-label="More">
  <div class="row spread">
    <b>
      {panelKind === "addMolecule"
        ? `Add a molecule after ${stateName}`
        : panelKind === "shortenGroup"
          ? "Shorten a group (Ph, tBu)"
          : `${stateName} as SMILES`}
    </b>
    <button class="btn sm" onclick={onClose}>Close</button>
  </div>
  {#if panelKind === "addMolecule"}
    <label class="f" for="arriving">Molecules that arrive (SMILES)</label>
    <input id="arriving" class="mono" bind:value={arrivingSmiles} placeholder="CC=O" />
    <label class="f" for="leaving">
      Molecules that leave (any atom number of each, comma-separated)
    </label>
    <input id="leaving" bind:value={leavingMapNumbers} placeholder="7, 8" />
    <button
      class="btn sm mt"
      onclick={() => {
        onAddChange(arrivingSmiles, leavingMapNumbers);
      }}
    >
      Add the change
    </button>
  {:else if panelKind === "shortenGroup"}
    <label class="f" for="groups">
      One group per line: label @ attachment atom: its atom numbers
    </label>
    <textarea
      id="groups"
      data-field="abbreviatedGroups"
      rows="3"
      value={abbreviatedGroupsText(groups)}
      onchange={(event) => {
        const read = readAbbreviatedGroups(event.currentTarget.value);
        apply(
          "reason" in read
            ? { outcome: "refused", reason: read.reason }
            : setReactionField(document, "abbreviatedGroups", read.value),
        );
      }}></textarea>
  {:else}
    <label class="f" for="state-smiles">Mapped SMILES (every atom keeps its number)</label>
    <textarea
      id="state-smiles"
      data-field="mappedSmiles"
      class="mono"
      rows="3"
      bind:value={editedSmiles}></textarea>
    <div class="row mt">
      <button
        class="btn sm"
        disabled={editedSmiles === mappedSmiles}
        onclick={() => {
          onApplySmiles(editedSmiles, false);
        }}
      >
        Apply
      </button>
      <button
        class="btn sm"
        onclick={() => {
          onApplySmiles(editedSmiles, true);
        }}
      >
        Apply and regenerate the states after it
      </button>
    </div>
  {/if}
</section>
