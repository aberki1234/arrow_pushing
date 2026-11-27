<script lang="ts">
  // Create's Teaching stage (docs/SPEC.md §5, "Create", stage 3): the to-do list
  // (reactionEditing/teaching/teachingChecklist.ts), grouped by step, and the one item open beside
  // it.
  import type { LintFinding } from "../../../tooling/reactionLinting/findings/lintFindings.js";
  import {
    nextTeachingItemKey,
    teachingChecklist,
    teachingCounts,
    teachingItemKey,
  } from "../../reactionEditing/teaching/teachingChecklist.js";
  import { teachingGroupTitle, teachingItemBadge, teachingItemLabel } from "../model/createView.js";
  import { currentDraft, type EditorSession, selectTeachingItem } from "../model/editorSession.js";
  import TeachingItemPane from "./TeachingItemPane.svelte";

  const {
    session,
    update,
    findings,
  }: {
    session: EditorSession;
    update: (next: EditorSession) => void;
    findings: readonly LintFinding[];
  } = $props();

  const document = $derived(currentDraft(session));
  const groups = $derived(teachingChecklist(document, findings));
  const counts = $derived(teachingCounts(groups));
  const donePercent = $derived(
    Math.round((100 * counts.doneCount) / Math.max(1, counts.itemCount)),
  );
  const openItem = $derived(
    groups
      .flatMap((group) => group.items)
      .find((item) => teachingItemKey(item) === session.teachingItemKey),
  );

  function markOf(itemStatus: string, need: string, filledCount: number): string {
    if (itemStatus === "done") {
      return "✓";
    }
    if (need === "needed" && itemStatus === "missing") {
      return "!";
    }
    return filledCount > 0 ? String(filledCount) : "·";
  }
</script>

<div class="teach mt">
  <section class="card flat" aria-label="To do">
    <div class="row spread">
      <b>To do</b>
      <span class="small muted">
        {counts.neededLeftCount === 0
          ? "Nothing needed is missing"
          : `${String(counts.neededLeftCount)} needed before publishing`}
      </span>
    </div>
    <div class="bar mt-small">
      <i style={`width: ${String(donePercent)}%`}></i>
    </div>
    {#each groups as group (`${group.groupKind} ${String(group.groupSubject)}`)}
      <div class="grouphead">{teachingGroupTitle(document, group)}</div>
      <ul class="todo">
        {#each group.items as item (teachingItemKey(item))}
          {@const badge = teachingItemBadge(item)}
          <li>
            <button
              aria-current={teachingItemKey(item) === session.teachingItemKey}
              onclick={() => {
                update(selectTeachingItem(session, teachingItemKey(item)));
              }}
            >
              <span
                class="mark"
                class:ok={item.itemStatus === "done"}
                class:need={item.need === "needed" && item.itemStatus === "missing"}
                aria-hidden="true"
              >
                {markOf(item.itemStatus, item.need, item.filledCount)}
              </span>
              {teachingItemLabel(document, item)}
              {#if badge !== ""}
                <span class={`pill tag ${item.need === "needed" ? "warn" : ""}`}>{badge}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/each}
  </section>

  <section class="card" aria-label="Open item">
    {#if openItem === undefined}
      <p class="muted">Choose an item on the left.</p>
    {:else}
      <TeachingItemPane {session} {update} item={openItem} />
      <div class="row spread mt">
        <span class="small muted">Saved when you leave a field.</span>
        <button
          class="btn primary"
          onclick={() => {
            const nextKey = nextTeachingItemKey(groups, session.teachingItemKey);
            if (nextKey !== null) {
              update(selectTeachingItem(session, nextKey));
            }
          }}
        >
          Next to do →
        </button>
      </div>
    {/if}
  </section>
</div>
