<script lang="ts">
  // The site's top bar: brand, the reaction list, and a light/dark theme switch (not yet
  // remembered between visits: learner settings arrive with progress in item 7b).
  function toggleTheme(): void {
    const root = document.documentElement;
    const chosen = root.dataset["theme"];
    const isDark =
      chosen === "dark" ||
      (chosen === undefined && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.dataset["theme"] = isDark ? "light" : "dark";
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
    <a class="tab" href="#/">Reactions</a>
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
