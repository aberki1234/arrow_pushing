<script lang="ts">
  // Create's sub-navigation (docs/SPEC.md §6, "Contributors"): Your mechanisms · Review (n) ·
  // Users, the last two for the roles that may use them (reviewView.createSections).
  import { CREATE_SECTION_TO_LABEL, type CreateSection } from "../model/reviewView.js";

  const {
    sections,
    current,
    reviewCount,
    onSection,
  }: {
    sections: readonly CreateSection[];
    current: CreateSection;
    /** Submissions waiting for this reviewer; null before it is known. */
    reviewCount: number | null;
    onSection: (section: CreateSection) => void;
  } = $props();
</script>

{#if sections.length > 1}
  <nav class="subnav" aria-label="Create">
    {#each sections as section (section)}
      <button
        aria-current={section === current ? "page" : undefined}
        onclick={() => {
          onSection(section);
        }}
      >
        {CREATE_SECTION_TO_LABEL[section]}
        {#if section === "review" && reviewCount !== null && reviewCount > 0}
          <span class="badge" aria-label={`${String(reviewCount)} waiting`}>{reviewCount}</span>
        {/if}
      </button>
    {/each}
  </nav>
{/if}
