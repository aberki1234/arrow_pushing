<script lang="ts">
  // Before a draft is open: the saved reactions (content/reactions/, or the server's after signing
  // in), a new reaction from SMILES, or a reaction file from this computer.
  import type { ListedReactionFile } from "./reactionFileStore.js";

  const {
    files,
    storagePlace,
    message,
    toolkitReady,
    signInNeeded = false,
    onOpen,
    onCreate,
    onOpenLocal,
    onSignIn,
    onEdit,
  }: {
    files: readonly ListedReactionFile[] | null;
    storagePlace: string;
    message: string;
    toolkitReady: boolean;
    /** On the server, before signing in: the list waits for it. */
    signInNeeded?: boolean;
    onOpen: (fileName: string) => void;
    onCreate: (reactionSlug: string, title: string, pastedSmiles: string) => void;
    onOpenLocal: (file: File) => void;
    onSignIn?: (() => void) | undefined;
    /** On the server: "Edit" a published reaction, its next version as a draft. */
    onEdit?: ((fileName: string) => void) | undefined;
  } = $props();

  let reactionSlug = $state("");
  let title = $state("");
  let pastedSmiles = $state("");
</script>

<h1 class="mt">Reaction editor</h1>
{#if message !== ""}
  <p class="small message bad" role="status">{message}</p>
{/if}
<div class="grid g2 mt">
  <section class="card" aria-label="Drafts">
    <h3>Reactions on {storagePlace}</h3>
    {#if signInNeeded}
      <p class="small muted">Only the owner's GitHub account may sign in.</p>
      <button class="btn primary sm" onclick={onSignIn}>Sign in with GitHub</button>
    {:else if files === null}
      <p class="small muted">
        The file server is not running: start the editor with make editor, or open a file below.
      </p>
    {:else if files.length === 0}
      <p class="small muted">No drafts yet.</p>
    {:else}
      <ul>
        {#each files as file (file.fileName)}
          <li>
            <button
              class="btn sm"
              onclick={() => {
                onOpen(file.fileName);
              }}
            >
              {file.title ?? file.fileName}
            </button>
            <span class="small muted">{file.fileName}</span>
            {#if file.newestSubmissionStatus !== undefined}
              <span class="pill">
                {file.newestSubmissionStatus} v{String(file.newestReactionVersion)}
              </span>
            {/if}
            {#if onEdit !== undefined && file.newestSubmissionStatus === "published"}
              <button
                class="btn sm"
                onclick={() => {
                  onEdit(file.fileName);
                }}
              >
                Edit as version {String((file.newestReactionVersion ?? 0) + 1)}
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    <label class="small mt" for="local-file">Open a reaction file from this computer</label>
    <input
      id="local-file"
      type="file"
      accept=".json,application/json"
      onchange={(event) => {
        const file = event.currentTarget.files?.[0];
        if (file !== undefined) {
          onOpenLocal(file);
        }
      }}
    />
  </section>
  <section class="card" aria-label="New reaction">
    <h3>New reaction</h3>
    <label class="small" for="new-slug">Slug (lower case, words joined by -)</label>
    <input id="new-slug" bind:value={reactionSlug} placeholder="sn2-hydroxide-bromoethane" />
    <label class="small" for="new-title">Title</label>
    <input id="new-title" bind:value={title} placeholder="SN2 substitution" />
    <label class="small" for="new-smiles">Start structure (SMILES; molecules joined by .)</label>
    <input id="new-smiles" bind:value={pastedSmiles} placeholder="[OH-].CCBr" />
    <button
      class="btn primary sm mt"
      disabled={!toolkitReady}
      onclick={() => {
        onCreate(reactionSlug, title, pastedSmiles);
      }}
    >
      {toolkitReady ? "Create" : "Loading RDKit…"}
    </button>
  </section>
</div>
