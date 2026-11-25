<script lang="ts">
  // The site's top bar: brand, Home · Daily · Learn · Practice · Progress, and a light/dark
  // theme switch remembered in the learner's progress (settings.theme).
  import { readProgress, withTheme, writeProgress } from "../learnerProgress/learnerProgress.js";
  import { browserStorage } from "./browserStorage.js";
  import type { SiteRoute } from "./siteRoutes.js";

  const { route }: { route: SiteRoute } = $props();

  const NAV_TABS = [
    { routeName: "home", hash: "#/", label: "Home" },
    { routeName: "daily", hash: "#/daily", label: "Daily" },
    { routeName: "learn", hash: "#/learn", label: "Learn" },
    { routeName: "practice", hash: "#/practice", label: "Practice" },
    { routeName: "progress", hash: "#/progress", label: "Progress" },
  ] as const;

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
    <a class="brand" href="#/">
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
    {#each NAV_TABS as tab (tab.routeName)}
      <a
        class="tab"
        href={tab.hash}
        aria-current={route.routeName === tab.routeName ? "page" : undefined}
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
