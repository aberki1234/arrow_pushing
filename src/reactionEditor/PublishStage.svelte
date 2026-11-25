<script lang="ts">
  // Create's Publish stage (docs/SPEC.md §5, "Create", stage 4): try it as a learner; the checks
  // as tasks (reactionEditing/checkTasks.ts) with Fix →; the library details, the suggested
  // difficulty, More details and Advanced; then the licence and Publish (on the server, for a
  // role that may publish: reactionDatabase/sitePermissions.ts).
  import { publishChecks } from "../reactionEditing/checkTasks.js";
  import { suggestedDifficultyTier } from "../reactionEditing/difficultySuggestion.js";
  import { REACTION_CLASSES, setReactionField } from "../reactionEditing/fieldEdits.js";
  import { previewReadiness } from "../reactionEditing/learnerPreview.js";
  import type { LintFinding } from "../reactionLinting/lintFindings.js";
  import {
    applyDocumentEdit,
    currentDraft,
    type DocumentEdit,
    type EditorSession,
    goToPlace,
  } from "./editorSession.js";
  import PublishDetails from "./PublishDetails.svelte";

  const {
    session,
    update,
    findings,
    linting,
    onPlay,
    onDownload,
    onPublish,
  }: {
    session: EditorSession;
    update: (next: EditorSession) => void;
    findings: readonly LintFinding[];
    linting: boolean;
    onPlay: (stateId: string) => void;
    onDownload: () => void;
    /** Present when the signed-in role may publish on the server. */
    onPublish?: ((licenceAgreed: boolean) => void) | undefined;
  } = $props();

  const TIERS = [
    { tier: 1, dots: "●○○" },
    { tier: 2, dots: "●●○" },
    { tier: 3, dots: "●●●" },
  ];

  let licenceAgreed = $state(false);
  const document = $derived(currentDraft(session));
  const tasks = $derived(publishChecks(document, findings));
  const readiness = $derived(previewReadiness(document));
  const suggestedTier = $derived(suggestedDifficultyTier(document));
  const classes = $derived(
    Array.isArray(document.reactionClasses) ? document.reactionClasses.map(String) : [],
  );

  function setField(key: string, value: unknown): void {
    update(applyDocumentEdit(session, setReactionField(document, key, value)));
  }

  function toggleClass(reactionClass: string): void {
    setField(
      "reactionClasses",
      classes.includes(reactionClass)
        ? classes.filter((item) => item !== reactionClass)
        : [...classes, reactionClass],
    );
  }

  function applyEdit(edit: DocumentEdit): void {
    update(applyDocumentEdit(session, edit));
  }
</script>

<div class="narrow mt">
  <section class="card hero row spread" aria-label="Try it">
    <div>
      <h3>Try it as a learner first</h3>
      <span class="muted small">
        {readiness.ready
          ? "The real step screen, with your hints and wrong-answer messages."
          : readiness.reason}
      </span>
    </div>
    <button
      class="btn primary"
      disabled={!readiness.ready}
      onclick={() => {
        onPlay(String(document.startStateId));
      }}
    >
      ▶ Play as learner
    </button>
  </section>

  <section class="card mt" aria-label="Checks">
    <h3>Checks</h3>
    {#if linting}
      <p class="small muted">Checking…</p>
    {:else if tasks.length === 0}
      <p class="small message good">✓ No problems found.</p>
    {/if}
    <ul class="todo">
      {#each tasks as task, position (position)}
        <li>
          <button
            onclick={() => {
              update(goToPlace(session, task.place));
            }}
          >
            <span
              class={`mark ${task.lintLevel === "error" ? "need" : "warnmark"}`}
              aria-hidden="true"
            >
              {task.lintLevel === "error" ? "✕" : "!"}
            </span>
            {task.taskText}
            <span class="tag small accent">
              {task.lintLevel === "error" ? "Fix →" : "Improve →"}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  </section>

  <section class="card mt" aria-label="Details for the library">
    <h3>Details for the library</h3>
    <p class="f">Reaction type</p>
    <div class="row">
      {#each REACTION_CLASSES as reactionClass (reactionClass)}
        <button
          class="chip"
          aria-pressed={classes.includes(reactionClass)}
          onclick={() => {
            toggleClass(reactionClass);
          }}
        >
          {reactionClass}
        </button>
      {/each}
    </div>
    <p class="f">Difficulty</p>
    <div class="row" role="group" aria-label="Difficulty">
      {#each TIERS as { tier, dots } (tier)}
        <button
          class="chip"
          aria-pressed={document.difficultyTier === tier}
          onclick={() => {
            setField("difficultyTier", tier);
          }}
        >
          {dots}
        </button>
      {/each}
      <span class="small muted">suggested: {TIERS[suggestedTier - 1]?.dots}</span>
    </div>
    <label class="f" for="publish-subtitle">
      One-line description <span class="optional">optional</span>
    </label>
    <input
      id="publish-subtitle"
      value={typeof document.subtitle === "string" ? document.subtitle : ""}
      placeholder="e.g. Hydroxide displaces bromide from bromomethane"
      onchange={(event) => {
        setField("subtitle", event.currentTarget.value);
      }}
    />
    <PublishDetails {document} apply={applyEdit} />
  </section>

  <section class="card mt" aria-label="Publish">
    {#if onPublish === undefined}
      <p class="small muted">
        Publishing happens on the server. Here, the draft is saved in content/reactions/.
      </p>
      <button class="btn sm" onclick={onDownload}>Download the JSON file</button>
    {:else}
      <label class="row small">
        <input type="checkbox" bind:checked={licenceAgreed} />
        I publish this under CC BY-SA 4.0, with my name shown on the reaction (needed once)
      </label>
      <div class="row spread mt">
        <button class="btn sm" onclick={onDownload}>Download the JSON file</button>
        <button
          class="btn primary"
          title="Save, then publish: the server checks the draft first"
          onclick={() => {
            onPublish(licenceAgreed);
          }}
        >
          Publish
        </button>
      </div>
    {/if}
  </section>
</div>
