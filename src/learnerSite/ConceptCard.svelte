<script lang="ts">
  // A problem set's concept card (item 9b): its text in the small Markdown subset, drawn from
  // blocks (conceptCardText.ts), never as HTML, and its figures. Open on a first visit to the
  // problem set, folded once a set item is done.
  import { conceptCardBlocks } from "../learnTracks/conceptCardText.js";

  const {
    conceptCard,
    figureSitePaths,
    open,
  }: { conceptCard: string; figureSitePaths: readonly string[]; open: boolean } = $props();

  const blocks = $derived(conceptCardBlocks(conceptCard));
</script>

{#snippet textRuns(runs: readonly { text: string; bold: boolean; italic: boolean }[])}
  {#each runs as run, i (i)}
    {#if run.bold}<strong>{run.text}</strong>{:else if run.italic}<em>
        {run.text}
      </em>{:else}{run.text}{/if}
  {/each}
{/snippet}

<details class="card flat concept mt" {open}>
  <summary><b>The idea</b></summary>
  {#each blocks as block, i (i)}
    {#if block.blockKind === "list"}
      <ul>
        {#each block.listItems as listItem, j (j)}
          <li>{@render textRuns(listItem)}</li>
        {/each}
      </ul>
    {:else}
      <p>{@render textRuns(block.textRuns)}</p>
    {/if}
  {/each}
  {#each figureSitePaths as figureSitePath (figureSitePath)}
    <img class="figure" src={figureSitePath} alt="" />
  {/each}
</details>
