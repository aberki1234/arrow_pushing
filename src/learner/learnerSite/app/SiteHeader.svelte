<script lang="ts">
  // The top bar, the same on the learner site and on Create (siteNavigation.ts): the brand,
  // Home · Daily · Learn · Practice · Progress · Create, and a light/dark theme switch remembered
  // for both sites (sharedTheme.ts). Create passes onCurrentTab, so that its own tab
  // goes back to Your mechanisms without reloading the page, and onSignOut while someone is
  // signed in, for a Sign out button beside Theme. About (the source code, licences and credits)
  // sits just left of Theme.
  import { saveTheme } from "../io/sharedTheme.js";
  import { brandMarkGeometry } from "../model/brandMark.js";
  import type { NavigationTab, NavigationTabName } from "../model/siteNavigation.js";

  const {
    tabs,
    about,
    currentTab,
    brandHref,
    onCurrentTab,
    onSignOut,
  }: {
    tabs: readonly NavigationTab[];
    /** The About link (siteNavigation.ts aboutLink). */
    about: NavigationTab;
    currentTab: NavigationTabName | null;
    /** Where the brand goes: the learner site's home. */
    brandHref: string;
    onCurrentTab?: (() => void) | undefined;
    /** Create, while someone is signed in: end the session. */
    onSignOut?: (() => void) | undefined;
  } = $props();

  const mark = brandMarkGeometry();

  function toggleTheme(): void {
    const root = document.documentElement;
    const chosen = root.dataset["theme"];
    const isDark =
      chosen === "dark" ||
      (chosen === undefined && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const theme = isDark ? "light" : "dark";
    root.dataset["theme"] = theme;
    saveTheme(theme);
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
      <!-- The brand mark (brandMark.ts), in theme colours; icons/favicon.svg draws the same. -->
      <svg viewBox="0 0 {mark.viewBoxSide} {mark.viewBoxSide}" aria-hidden="true">
        <rect
          width={mark.viewBoxSide}
          height={mark.viewBoxSide}
          rx={mark.tileCornerRadius}
          fill="var(--accent)"
        />
        <path
          d={mark.arrowShaftPath}
          fill="none"
          stroke="var(--accent-ink)"
          stroke-width={mark.arrowShaftWidth}
          stroke-linecap="round"
        />
        <polygon
          points={mark.arrowheadPoints}
          fill="var(--accent-ink)"
          stroke="var(--accent-ink)"
          stroke-linejoin="round"
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
    {#if onSignOut !== undefined}
      <button class="iconbtn" type="button" onclick={onSignOut}>Sign out</button>
    {/if}
    <a
      class="tab"
      href={about.href}
      aria-current={currentTab === about.tabName ? "page" : undefined}
    >
      {about.label}
    </a>
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
