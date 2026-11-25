<script lang="ts">
  // The learner site: a header and the page the URL hash names (siteRoutes.ts).
  import { onMount } from "svelte";
  import { fetchSiteJson, loadCatalogue } from "../siteData/siteData.js";
  import DailyPage from "./DailyPage.svelte";
  import HomePage from "./HomePage.svelte";
  import LearnPage from "./LearnPage.svelte";
  import LearnPlay from "./LearnPlay.svelte";
  import ProblemSetPage from "./ProblemSetPage.svelte";
  import PracticePage from "./PracticePage.svelte";
  import ProgressPage from "./ProgressPage.svelte";
  import SiteHeader from "./SiteHeader.svelte";
  import StepScreen from "./StepScreen.svelte";
  import TrackPage from "./TrackPage.svelte";
  import { parseSiteRoute } from "./siteRoutes.js";

  let route = $state(parseSiteRoute(window.location.hash));
  const cataloguePromise = loadCatalogue(fetchSiteJson);

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

<SiteHeader {route} />
<main class="wrap">
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
</main>
