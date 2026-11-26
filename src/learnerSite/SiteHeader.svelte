<script lang="ts">
  // The top bar, the same on the learner site and on Create (siteNavigation.ts): the brand,
  // Home · Daily · Learn · Practice · Progress · Create, and a light/dark theme switch remembered
  // in the learner's progress (settings.theme). Create passes onCurrentTab, so that its own tab
  // goes back to Your mechanisms without reloading the page.
  import { readProgress, withTheme, writeProgress } from "../learnerProgress/learnerProgress.js";
  import { browserStorage } from "./browserStorage.js";
  import type { NavigationTab, NavigationTabName } from "./siteNavigation.js";

  const {
    tabs,
    currentTab,
    brandHref,
    onCurrentTab,
  }: {
    tabs: readonly NavigationTab[];
    currentTab: NavigationTabName | null;
    /** Where the brand goes: the learner site's home. */
    brandHref: string;
    onCurrentTab?: (() => void) | undefined;
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

  function followTab(event: MouseEvent, tab: NavigationTab): void {
    if (tab.tabName === currentTab && onCurrentTab !== undefined) {
      event.preventDefault();
      onCurrentTab();
    }
  }
</script>

<nav class="nav" aria-label="Site">
  <div class="nav-in">
    <a class="brand" href={brandHref}>
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
    </a>
    {#each tabs as tab (tab.tabName)}
      <a
        class="tab"
        href={tab.href}
        aria-current={currentTab === tab.tabName ? "page" : undefined}
        onclick={(event: MouseEvent) => {
          followTab(event, tab);
        }}
      >
        {tab.label}
      </a>
    {/each}
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
