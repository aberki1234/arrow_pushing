/**
 * The learner site's routes, kept in the URL hash so the site works from any static host:
 *   #/                                  the list of reactions (temporary in 7a)
 *   #/play/<slug>@<version>             play a reaction version in practice mode
 * Anything else is the list.
 */
export type SiteRoute =
  | { readonly routeName: "reactionList" }
  | { readonly routeName: "play"; readonly reactionVersionRef: string };

const PLAY_HASH_PATTERN = /^#\/play\/([a-z0-9]+(?:-[a-z0-9]+)*@[1-9][0-9]*)$/;

export function parseSiteRoute(locationHash: string): SiteRoute {
  const playMatch = PLAY_HASH_PATTERN.exec(locationHash);
  return playMatch?.[1] === undefined
    ? { routeName: "reactionList" }
    : { routeName: "play", reactionVersionRef: playMatch[1] };
}

export function siteRouteHash(route: SiteRoute): string {
  return route.routeName === "play" ? `#/play/${route.reactionVersionRef}` : "#/";
}
