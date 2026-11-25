<script lang="ts">
  // Create's home, "Your mechanisms" (docs/SPEC.md §5, "Create"): a new mechanism, improving a
  // published one (its next version), and every saved reaction with its status and progress.
  import { creationProgressLine } from "../reactionEditing/creationProgress.js";
  import type { ListedReactionFile } from "./reactionFileStore.js";

  const {
    files,
    storagePlace,
    message,
    signInNeeded = false,
    onNew,
    onOpen,
    onOpenLocal,
    onSignIn,
    onEdit,
  }: {
    files: readonly ListedReactionFile[] | null;
    storagePlace: string;
    message: string;
    /** On the server, before signing in: the list waits for it. */
    signInNeeded?: boolean;
    onNew: () => void;
    onOpen: (fileName: string) => void;
    onOpenLocal: (file: File) => void;
    onSignIn?: (() => void) | undefined;
    /** On the server: a published reaction's next version as a draft. */
    onEdit?: ((fileName: string) => void) | undefined;
  } = $props();

  const STATUS_TO_PILL: Readonly<Record<string, { text: string; pillClass: string }>> = {
    draft: { text: "Draft", pillClass: "" },
    submitted: { text: "In review", pillClass: "new" },
    changes_requested: { text: "Changes requested", pillClass: "warn" },
    published: { text: "Published", pillClass: "good" },
  };

  const published = $derived(
    (files ?? []).filter((file) => file.newestSubmissionStatus === "published"),
  );
  const unreachableText = $derived(
    `Nothing to list: ${storagePlace} cannot be reached. Start the editor with make editor, ` +
      "or open a file below.",
  );
  let chosenToImprove = $state("");
  const toImprove = $derived(
    published.some((file) => file.fileName === chosenToImprove)
      ? chosenToImprove
      : (published[0]?.fileName ?? ""),
  );

  function nextVersionOf(file: ListedReactionFile | undefined): string {
    return String((file?.newestReactionVersion ?? 0) + 1);
  }
</script>

<div class="row spread mt">
  <div>
    <h1>Create</h1>
    <p class="muted">
      Build a mechanism puzzle for others to learn from. Structures and arrows first; the teaching
      text comes later.
    </p>
  </div>
</div>
{#if message !== ""}
  <p class="small message bad" role="status">{message}</p>
{/if}
{#if signInNeeded}
  <section class="card mt" aria-label="Sign in">
    <h2>Sign in to create</h2>
    <p class="small muted">Creating is invite-only for now.</p>
    <button class="btn primary" onclick={onSignIn}>Sign in with GitHub</button>
  </section>
{:else}
  <div class="grid g2 mt">
    <button class="card hero bigchoice" onclick={onNew}>
      <span class="ic" aria-hidden="true">✚</span>
      <span class="choice-title">New mechanism</span>
      <span class="muted">Paste the starting materials, then push arrows.</span>
    </button>
    <section class="card bigchoice" aria-label="Improve a published one">
      <span class="ic" aria-hidden="true">✎</span>
      <span class="choice-title">Improve a published one</span>
      {#if onEdit === undefined || published.length === 0}
        <span class="muted small">
          Published reactions appear here; editing one makes its next version, and learners keep the
          old one until the new one is published.
        </span>
      {:else}
        <span class="row">
          <select aria-label="Published reaction" bind:value={chosenToImprove}>
            {#each published as file (file.fileName)}
              <option value={file.fileName}>{file.title ?? file.fileName}</option>
            {/each}
          </select>
          <button
            class="btn sm"
            onclick={() => {
              onEdit(toImprove);
            }}
          >
            Edit as version {nextVersionOf(published.find((file) => file.fileName === toImprove))}
          </button>
        </span>
      {/if}
    </section>
  </div>

  <h2 class="mt2">Your mechanisms</h2>
  <section class="card flat mylist" aria-label="Your mechanisms">
    {#if files === null}
      <p class="small muted">
        {unreachableText}
      </p>
    {:else if files.length === 0}
      <p class="small muted">None yet: start with New mechanism.</p>
    {/if}
    {#each files ?? [] as file (file.fileName)}
      {@const pill = STATUS_TO_PILL[file.newestSubmissionStatus ?? "draft"]}
      <div class="item">
        <div class="grow">
          <b>{file.title ?? file.fileName}</b>
          <div class="small muted">
            {file.creationProgress === null
              ? file.fileName
              : creationProgressLine(file.creationProgress)}
            {#if file.newestReactionVersion !== undefined}
              · version {String(file.newestReactionVersion)}
            {/if}
          </div>
        </div>
        {#if pill !== undefined}
          <span class={`pill ${pill.pillClass}`}>{pill.text}</span>
        {/if}
        {#if onEdit !== undefined && file.newestSubmissionStatus === "published"}
          <button
            class="btn sm"
            onclick={() => {
              onEdit(file.fileName);
            }}
          >
            Edit as version {nextVersionOf(file)}
          </button>
        {:else}
          <button
            class="btn sm"
            aria-label={`Continue ${file.title ?? file.fileName}`}
            onclick={() => {
              onOpen(file.fileName);
            }}
          >
            Continue
          </button>
        {/if}
      </div>
    {/each}
  </section>
  <label class="small muted mt block" for="local-file">
    Or open a reaction file from this computer
  </label>
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
{/if}
