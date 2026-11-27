<script lang="ts">
  // The learner site: a header and the page the URL hash names (siteRoutes.ts).
  import { onMount } from "svelte";
  import { fetchSiteJson, loadCatalogue } from "../../siteData/siteData.js";
  import DailyPage from "../pages/DailyPage.svelte";
  import HomePage from "../pages/HomePage.svelte";
  import LearnPage from "../pages/LearnPage.svelte";
  import LearnPlay from "../pages/LearnPlay.svelte";
  import ProblemSetPage from "../pages/ProblemSetPage.svelte";
  import PracticePage from "../pages/PracticePage.svelte";
  import ProgressPage from "../pages/ProgressPage.svelte";
  import SiteHeader from "./SiteHeader.svelte";
  import StepScreen from "../workspaces/StepScreen.svelte";
  import TrackPage from "../pages/TrackPage.svelte";
  import AboutPage from "../pages/AboutPage.svelte";
  import { aboutLink, navigationTabs, type NavigationTabName } from "../model/siteNavigation.js";
  import { parseSiteRoute } from "../model/siteRoutes.js";

  const {
    createAddress = null,
  }: {
    /** Create's address, for the Create tab (VITE_CREATE_ADDRESS); null leaves the tab out. */
    createAddress?: string | null;
  } = $props();

  let route = $state(parseSiteRoute(window.location.hash));
  const cataloguePromise = loadCatalogue(fetchSiteJson);
  const tabs = $derived(navigationTabs({ learnerSiteAddress: "", createAddress }));
  // A page with a tab of its own marks it; playing a reaction marks none.
  const currentTab = $derived<NavigationTabName | null>(
    route.routeName === "about"
      ? "about"
      : (tabs.find((tab) => tab.tabName === route.routeName)?.tabName ?? null),
  );

  onMount(() => {
    const followHash = (): void => {
      route = parseSiteRoute(window.location.hash);
    };
    window.addEventListener("hashchange", followHash);
    return () => {
      window.removeEventListener("hashchange", followHash);
    };
  });
</script>

<SiteHeader {tabs} about={aboutLink("")} {currentTab} brandHref="#/" />
<main class="wrap">
  <!-- About needs no catalogue: the source code is offered even if the reactions fail to load. -->
  {#if route.routeName === "about"}
    <AboutPage {createAddress} />
  {:else}
    {#await cataloguePromise}
      <p class="muted mt">Loading reactions…</p>
    {:then catalogue}
      {#if route.routeName === "daily"}
        <DailyPage {catalogue} />
      {:else if route.routeName === "play"}
        {#key route.reactionVersionRef}
          <StepScreen {catalogue} reactionVersionRef={route.reactionVersionRef} />
        {/key}
      {:else if route.routeName === "learn"}
        {#if route.trackSlug === null}
          <LearnPage {catalogue} />
        {:else if route.problemSetSlug === null}
          <TrackPage {catalogue} trackSlug={route.trackSlug} />
        {:else if route.reactionSlug === null}
          {#key route.problemSetSlug}
            <ProblemSetPage
              {catalogue}
              trackSlug={route.trackSlug}
              problemSetSlug={route.problemSetSlug}
            />
          {/key}
        {:else}
          {#key `${route.problemSetSlug}/${route.reactionSlug}`}
            <LearnPlay
              {catalogue}
              trackSlug={route.trackSlug}
              problemSetSlug={route.problemSetSlug}
              reactionSlug={route.reactionSlug}
            />
          {/key}
        {/if}
      {:else if route.routeName === "practice"}
        <PracticePage {catalogue} practiceQuery={route.practiceQuery} />
      {:else if route.routeName === "progress"}
        <ProgressPage {catalogue} />
      {:else}
        <HomePage {catalogue} />
      {/if}
    {:catch loadError}
      <div class="card mt" role="alert">
        <h2>The reactions could not be loaded</h2>
        <p class="muted">{String(loadError)}</p>
      </div>
    {/await}
  {/if}
</main>
