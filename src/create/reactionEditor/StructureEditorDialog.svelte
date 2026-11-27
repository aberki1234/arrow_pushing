<script lang="ts">
  // Create's structure editor (item 10h): Ketcher (EPAM, Apache-2.0), served by Create's own
  // server at /ketcher/ and shown here in a dialog. It opens on the selected state's molfile
  // (structureExchange.stateToMolfile) and hands back its molfile on Save; what may change is
  // decided by structureExchange.saveStructureFromEditor.
  const {
    molfile,
    canChangeBonds,
    onSave,
    onCancel,
  }: {
    molfile: string;
    /** The start state: any change; a later state: layout and wedges only. */
    canChangeBonds: boolean;
    onSave: (molfile: string) => void;
    onCancel: () => void;
  } = $props();

  /** Ketcher's API on its window, as far as Create uses it. */
  interface KetcherApi {
    setMolecule(structure: string): Promise<void>;
    getMolfile(format: "v2000"): Promise<string>;
  }

  const KETCHER_ADDRESS = "/ketcher/index.html";
  const WAIT_MILLISECONDS = 200;
  const MOST_WAITS = 150;

  let frame: HTMLIFrameElement | undefined = $state();
  let ready = $state(false);
  let failure = $state("");

  function ketcherOf(): KetcherApi | undefined {
    return (frame?.contentWindow as (Window & { ketcher?: KetcherApi }) | null | undefined)
      ?.ketcher;
  }

  /** Wait for Ketcher to start in its frame, then load the state. */
  function onFrameLoad(): void {
    let waits = 0;
    const timer = setInterval(() => {
      waits += 1;
      const ketcher = ketcherOf();
      if (ketcher !== undefined) {
        clearInterval(timer);
        ketcher.setMolecule(molfile).then(
          () => {
            ready = true;
          },
          (error: unknown) => {
            failure = `Ketcher could not open the structure: ${String(error)}`;
          },
        );
      } else if (waits > MOST_WAITS) {
        clearInterval(timer);
        failure = "Ketcher did not start. Run make ketcher (or check the server's build).";
      }
    }, WAIT_MILLISECONDS);
  }

  async function save(): Promise<void> {
    const ketcher = ketcherOf();
    if (ketcher !== undefined) {
      onSave(await ketcher.getMolfile("v2000"));
    }
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      onCancel();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="structure-backdrop">
  <div class="structure-dialog card" role="dialog" aria-modal="true" aria-label="Edit structure">
    <div class="row spread">
      <h3>Edit structure</h3>
      <span class="small muted">
        {canChangeBonds
          ? "Start state: change anything."
          : "Bonds come from the arrows here: move atoms and set wedges and dashes."}
      </span>
    </div>
    <iframe
      bind:this={frame}
      title="Ketcher structure editor"
      src={KETCHER_ADDRESS}
      onload={onFrameLoad}
    ></iframe>
    {#if failure !== ""}
      <p class="small bad">{failure}</p>
    {/if}
    <div class="row mt">
      <button class="btn primary" disabled={!ready} onclick={() => void save()}>Save</button>
      <button class="btn" onclick={onCancel}>Cancel</button>
      <span class="small muted">Ketcher by EPAM (Apache-2.0)</span>
    </div>
  </div>
</div>

<style>
  .structure-backdrop {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 35%);
    display: grid;
    place-items: center;
    z-index: 50;
  }
  .structure-dialog {
    width: min(1100px, 94vw);
  }
  iframe {
    width: 100%;
    height: min(640px, 70vh);
    border: 1px solid var(--line);
    border-radius: 8px;
  }
</style>
