<script lang="ts">
  // Create's top bar, in the learner site's look (learnerSite/SiteHeader.svelte): the brand, the
  // Create tab, a link back to the learner site when its address is known, and the theme switch.
  import { readProgress, withTheme, writeProgress } from "../learnerProgress/learnerProgress.js";
  import { browserStorage } from "../learnerSite/browserStorage.js";

  const {
    learnerSiteAddress,
    onHome,
  }: {
    /** The learner site, for "Back to the site"; null hides the link (make editor). */
    learnerSiteAddress: string | null;
    /** Back to "Your mechanisms". */
    onHome: () => void;
  } = $props();

  function toggleTheme(): void {
    const root = document.documentElement;
    const chosen = root.dataset["theme"];
    const isDark =
      chosen === "dark" ||
      (chosen === undefined && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const theme = isDark ? "light" : "dark";
    root.dataset["theme"] = theme;
    writeProgress(browserStorage, withTheme(readProgress(browserStorage), theme));
  }
</script>

<nav class="nav" aria-label="Site">
  <div class="nav-in">
    <span class="brand">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="9" cy="22" r="4" fill="var(--accent)" />
        <circle cx="24" cy="10" r="4" fill="none" stroke="var(--ink)" stroke-width="2.5" />
        <path
          d="M11 17 Q14 4 20 8"
          fill="none"
          stroke="var(--arrow)"
          stroke-width="2.5"
          stroke-linecap="round"
        />
      </svg>
      ArrowPush
    </span>
    <a
      class="tab"
      href="#/"
      aria-current="page"
      onclick={(event) => {
        event.preventDefault();
        onHome();
      }}
    >
      Create
    </a>
    {#if learnerSiteAddress !== null}
      <a class="tab" href={learnerSiteAddress}>← Back to the site</a>
    {/if}
    <span class="spacer"></span>
    <button
      class="iconbtn"
      type="button"
      onclick={toggleTheme}
      aria-label="Switch between light and dark theme"
    >
      ◐ Theme
    </button>
  </div>
</nav>
