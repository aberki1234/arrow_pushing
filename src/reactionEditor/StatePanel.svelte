<script lang="ts">
  // The selected state: its mapped SMILES (edit in place, then regenerate the states after it),
  // and a change step (molecules arrive or leave).
  const {
    stateId,
    mappedSmiles,
    onApplySmiles,
    onAddChange,
  }: {
    stateId: string;
    mappedSmiles: string;
    onApplySmiles: (mappedSmiles: string, regenerate: boolean) => void;
    onAddChange: (pastedSmiles: string, removedMapNumbersText: string) => void;
  } = $props();

  // Starts as the state's SMILES (again whenever another state is shown); the author edits it.
  let editedSmiles = $derived(mappedSmiles);
  let arrivingSmiles = $state("");
  let leavingMapNumbers = $state("");
</script>

<section class="card" aria-label={`Structure of ${stateId}`}>
  <h3>Structure</h3>
  <label class="small" for="state-smiles">Mapped SMILES (every atom keeps its map number)</label>
  <textarea id="state-smiles" rows="3" bind:value={editedSmiles}></textarea>
  <div class="row">
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
      Apply and regenerate the states after this one
    </button>
  </div>
  <h3 class="mt">Change step</h3>
  <label class="small" for="arriving">Molecules that arrive (SMILES)</label>
  <input id="arriving" bind:value={arrivingSmiles} placeholder="CC=O" />
  <label class="small" for="leaving">
    Molecules that leave (any map number of each, comma-separated)
  </label>
  <input id="leaving" bind:value={leavingMapNumbers} placeholder="7, 8" />
  <button
    class="btn sm"
    onclick={() => {
      onAddChange(arrivingSmiles, leavingMapNumbers);
    }}
  >
    Add change step
  </button>
</section>
