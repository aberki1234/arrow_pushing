<script lang="ts">
  // Create's home, "Your mechanisms" (docs/SPEC.md §5, "Create", and §6, "Contributors"): a new
  // mechanism, improving any published one (its next version), and the user's own reactions with
  // their status and progress; a banner while a reviewer has asked for changes. On the server,
  // before signing in, the sign-in card instead.
  import { creationProgressLine } from "../reactionEditing/creationProgress.js";
  import type { SignInProvider } from "./contributorClient.js";
  import type { ListedReactionFile } from "./reactionFileStore.js";
  import {
    changesRequestedBanner,
    openDraftsLine,
    publishedToImprove,
    type YourMechanismsFilter,
    yourMechanisms,
    yourMechanismsFilterCounts,
    yourMechanismsShown,
    yourRowNote,
  } from "./reviewView.js";
  import SignInCard from "./SignInCard.svelte";

  const {
    files,
    storagePlace,
    message,
    signInNeeded = false,
    userId = null,
    signInProviders = ["github"],
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
    /** The signed-in user (on the server), else null: every listed file is one's own. */
    userId?: string | null;
    signInProviders?: readonly SignInProvider[];
    onNew: () => void;
    onOpen: (fileName: string) => void;
    onOpenLocal: (file: File) => void;
    onSignIn?: ((provider: SignInProvider) => void) | undefined;
    /** On the server: a published reaction's next version as a draft. */
    onEdit?: ((fileName: string) => void) | undefined;
  } = $props();

  const STATUS_TO_PILL: Readonly<Record<string, { text: string; pillClass: string }>> = {
    draft: { text: "Draft", pillClass: "" },
    submitted: { text: "In review", pillClass: "new" },
    changes_requested: { text: "Changes requested", pillClass: "warn" },
    published: { text: "Published", pillClass: "good" },
  };

  const yourFiles = $derived(userId === null ? (files ?? []) : yourMechanisms(files ?? [], userId));
  let filter: YourMechanismsFilter = $state("all");
  const filterCounts = $derived(yourMechanismsFilterCounts(yourFiles));
  const shownFiles = $derived(yourMechanismsShown(yourFiles, filter));
  const FILTERS: readonly { filter: YourMechanismsFilter; label: string }[] = [
    { filter: "all", label: "All" },
    { filter: "drafts", label: "Drafts" },
    { filter: "published", label: "Published" },
  ];
  const toImproveOptions = $derived(publishedToImprove(files ?? [], userId ?? ""));
  const banner = $derived(userId === null ? null : changesRequestedBanner(files ?? [], userId));
  const unreachableText = $derived(
    `Nothing to list: ${storagePlace} cannot be reached. Start the editor with make editor, ` +
      "or open a file below.",
  );
  let chosenToImprove = $state("");
  const toImprove = $derived(
    toImproveOptions.find((option) => option.fileName === chosenToImprove) ?? toImproveOptions[0],
  );

  function nextVersionOf(file: ListedReactionFile | undefined): string {
    return String((file?.newestReactionVersion ?? 0) + 1);
  }

  /** "Edit as version n" on one's own reaction, "Suggest version n" on someone else's. */
  function nextVersionLabel(file: ListedReactionFile | undefined): string {
    const verb =
      userId === null || file?.ownerUserId === undefined || file.ownerUserId === userId
        ? "Edit as"
        : "Suggest";
    return `${verb} version ${nextVersionOf(file)}`;
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
  <SignInCard
    providers={signInProviders}
    onSignIn={(provider: SignInProvider) => onSignIn?.(provider)}
  />
{:else}
  {#if banner !== null}
    <div class="note warn mt" role="status">
      <h4>{banner}</h4>
      Open it to see the notes on its Publish stage; submit again when you're done.
    </div>
  {/if}
  <div class="grid g2 mt">
    <button class="card hero bigchoice" onclick={onNew}>
      <span class="ic" aria-hidden="true">✚</span>
      <span class="choice-title">New mechanism</span>
      <span class="muted">Paste the starting materials, then push arrows.</span>
      {#if userId !== null}
        <span class="small muted">{openDraftsLine(files ?? [], userId)}</span>
      {/if}
    </button>
    <section class="card bigchoice" aria-label="Improve a published one">
      <span class="ic" aria-hidden="true">✎</span>
      <span class="choice-title">Improve a published one</span>
      {#if onEdit === undefined || toImprove === undefined}
        <span class="muted small">
          Published reactions appear here; editing one makes its next version, and learners keep the
          old one until the new one is published.
        </span>
      {:else}
        <span class="muted small">
          Any published reaction, yours or not: your copy goes to review as its next version, and
          you're credited beside its author.
        </span>
        <span class="row">
          <select aria-label="Published reaction" bind:value={chosenToImprove}>
            {#each toImproveOptions as option (option.fileName)}
              <option value={option.fileName}>{option.label}</option>
            {/each}
          </select>
          <button
            class="btn sm"
            onclick={() => {
              onEdit(toImprove.fileName);
            }}
          >
            {nextVersionLabel((files ?? []).find((file) => file.fileName === toImprove.fileName))}
          </button>
        </span>
      {/if}
    </section>
  </div>

  <div class="row spread mt2">
    <h2>Your mechanisms</h2>
    {#if yourFiles.length > 0}
      <div class="seg" role="group" aria-label="Show">
        {#each FILTERS as option (option.filter)}
          <button
            aria-pressed={filter === option.filter}
            onclick={() => {
              filter = option.filter;
            }}
          >
            {option.label} ({filterCounts[option.filter]})
          </button>
        {/each}
      </div>
    {/if}
  </div>
  <section class="card flat mylist" aria-label="Your mechanisms">
    {#if files === null}
      <p class="small muted">
        {unreachableText}
      </p>
    {:else if yourFiles.length === 0}
      <p class="small muted">None yet: start with New mechanism.</p>
    {:else if shownFiles.length === 0}
      <p class="small muted">
        {filter === "published" ? "None published yet." : "No drafts: everything is published."}
      </p>
    {/if}
    {#each shownFiles as file (file.fileName)}
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
            {#if userId !== null && yourRowNote(file, userId) !== ""}
              · {yourRowNote(file, userId)}
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
            {nextVersionLabel(file)}
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
