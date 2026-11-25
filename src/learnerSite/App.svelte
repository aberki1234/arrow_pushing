<script lang="ts">
  // The learner site: a header and the page the URL hash names (siteRoutes.ts).
  import { onMount } from "svelte";
  import { fetchSiteJson, loadCatalogue } from "../siteData/siteData.js";
  import DailyPage from "./DailyPage.svelte";
  import ReactionList from "./ReactionList.svelte";
  import SiteHeader from "./SiteHeader.svelte";
  import StepScreen from "./StepScreen.svelte";
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
    {:else}
      <ReactionList {catalogue} />
    {/if}
  {:catch loadError}
    <div class="card mt" role="alert">
      <h2>The reactions could not be loaded</h2>
      <p class="muted">{String(loadError)}</p>
    </div>
  {/await}
</main>
