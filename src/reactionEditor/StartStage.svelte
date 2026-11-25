<script lang="ts">
  // Create's Start stage (docs/SPEC.md §5, "Create", stage 1): only the reaction's name, the
  // starting materials as SMILES (drawn as they are typed) and optional conditions. Before the
  // draft exists this makes it; after, it edits the name and conditions.
  import type { ChemistryToolkit } from "../chemistryToolkit/chemistryToolkit.js";
  import { setReactionField } from "../reactionEditing/fieldEdits.js";
  import type { ReactionDocument } from "../reactionEditing/reactionDraft.js";
  import { type DraftStart, previewOfPastedSmiles } from "./draftCreation.js";
  import { draftDrawing } from "./editorView.js";
  import StateThumbnail from "./StateThumbnail.svelte";

  type Edit = ReturnType<typeof setReactionField>;

  const {
    toolkit,
    document,
    apply,
    onCreate,
    onNext,
  }: {
    toolkit: ChemistryToolkit | null;
    /** The draft, once it exists; null on a new mechanism. */
    document: ReactionDocument | null;
    apply: (edit: Edit) => void;
    onCreate: (fields: DraftStart) => void;
    onNext: () => void;
  } = $props();

  const EXAMPLES = [
    { label: "hydroxide + bromomethane", smiles: "[OH-].CBr" },
    { label: "benzene + Br₂", smiles: "c1ccccc1.BrBr" },
  ];

  let title = $state("");
  let pastedSmiles = $state("");
  let conditionsLabel = $state("");
  const preview = $derived(toolkit === null ? null : previewOfPastedSmiles(pastedSmiles, toolkit));
  const startDrawing = $derived(
    document === null ? null : draftDrawing(document, String(document.startStateId)).drawing,
  );
  const textOf = (key: string): string =>
    document !== null && typeof document[key] === "string" ? document[key] : "";
</script>

<section class="card narrow mt" aria-label="Start">
  {#if document === null}
    <label class="f" for="start-name">What is this reaction called?</label>
    <input id="start-name" bind:value={title} placeholder="e.g. SN2 of bromomethane" />
    <label class="f" for="start-smiles">What reacts? (SMILES; molecules joined by .)</label>
    <div class="row small muted">
      or try:
      {#each EXAMPLES as example (example.smiles)}
        <button
          class="chip"
          onclick={() => {
            pastedSmiles = example.smiles;
          }}
        >
          {example.label}
        </button>
      {/each}
    </div>
    <input id="start-smiles" class="mono" bind:value={pastedSmiles} placeholder="[OH-].CBr" />
    <div class="card flat mt preview" aria-live="polite">
      {#if toolkit === null}
        <p class="small muted">Loading the chemistry toolkit…</p>
      {:else if preview?.outcome === "drawn"}
        <StateThumbnail drawing={preview.drawing} />
      {:else if preview?.outcome === "refused"}
        <p class="small message bad">{preview.reason}</p>
      {:else}
        <p class="small muted">The molecules are drawn here as you type.</p>
      {/if}
    </div>
    <label class="f" for="start-conditions">
      Conditions over the arrow <span class="optional">optional</span>
    </label>
    <input id="start-conditions" bind:value={conditionsLabel} placeholder="e.g. NaOH, EtOH/H₂O" />
    <div class="row spread mt">
      <span class="small muted">That's all for now. Type, difficulty and teaching come later.</span>
      <button
        class="btn primary"
        disabled={toolkit === null}
        onclick={() => {
          onCreate({ title, pastedSmiles, conditionsLabel });
        }}
      >
        Push the arrows →
      </button>
    </div>
  {:else}
    <label class="f" for="start-name">What is this reaction called?</label>
    <input
      id="start-name"
      data-field="title"
      value={textOf("title")}
      onchange={(event) => {
        apply(setReactionField(document, "title", event.currentTarget.value));
      }}
    />
    <p class="small muted">Saved as {String(document.reactionSlug)}.</p>
    <p class="f">What reacts</p>
    {#if startDrawing !== null}
      <div class="card flat preview"><StateThumbnail drawing={startDrawing} /></div>
    {/if}
    <p class="small muted">
      To change the molecules, use ⋯ More → Edit as SMILES on the Mechanism stage.
    </p>
    <label class="f" for="start-conditions">
      Conditions over the arrow <span class="optional">optional</span>
    </label>
    <input
      id="start-conditions"
      data-field="conditionsLabel"
      value={textOf("conditionsLabel")}
      onchange={(event) => {
        apply(setReactionField(document, "conditionsLabel", event.currentTarget.value));
      }}
    />
    <div class="row spread mt">
      <span></span>
      <button class="btn primary" onclick={onNext}>Push the arrows →</button>
    </div>
  {/if}
</section>
