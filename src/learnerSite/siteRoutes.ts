/**
 * The learner site's routes, kept in the URL hash so the site works from any static host:
 *   #/                                  the list of reactions (temporary in 7a)
 *   #/play/<slug>@<version>             play a reaction version in practice mode
 *   #/daily                             today's daily puzzle
 * Anything else is the list.
 */
export type SiteRoute =
  | { readonly routeName: "reactionList" }
  | { readonly routeName: "daily" }
  | { readonly routeName: "play"; readonly reactionVersionRef: string };

const DAILY_HASH = "#/daily";
const PLAY_HASH_PATTERN = /^#\/play\/([a-z0-9]+(?:-[a-z0-9]+)*@[1-9][0-9]*)$/;

export function parseSiteRoute(locationHash: string): SiteRoute {
  if (locationHash === DAILY_HASH) {
    return { routeName: "daily" };
  }
  const playMatch = PLAY_HASH_PATTERN.exec(locationHash);
  return playMatch?.[1] === undefined
    ? { routeName: "reactionList" }
    : { routeName: "play", reactionVersionRef: playMatch[1] };
}

export function siteRouteHash(route: SiteRoute): string {
  switch (route.routeName) {
    case "play":
      return `#/play/${route.reactionVersionRef}`;
    case "daily":
      return DAILY_HASH;
    case "reactionList":
      return "#/";
  }
}
