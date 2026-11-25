<script lang="ts">
  // The site's top bar: brand, the daily puzzle, the reaction list, and a light/dark theme switch
  // remembered in the learner's progress (settings.theme).
  import { readProgress, withTheme, writeProgress } from "../learnerProgress/learnerProgress.js";
  import { browserStorage } from "./browserStorage.js";
  import type { SiteRoute } from "./siteRoutes.js";

  const { route }: { route: SiteRoute } = $props();

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
    <a class="tab" href="#/daily" aria-current={route.routeName === "daily" ? "page" : undefined}>
      Daily
    </a>
    <a class="tab" href="#/" aria-current={route.routeName === "reactionList" ? "page" : undefined}>
      Reactions
    </a>
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
