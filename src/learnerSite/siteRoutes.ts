/**
 * The learner site's routes, kept in the URL hash so the site works from any static host:
 *   #/                                  home
 *   #/daily                             today's daily puzzle
 *   #/practice[?type=…&difficulty=…&status=…&search=…]   the practice list and its filters
 *   #/progress                          the learner's progress
 *   #/play/<slug>@<version>             play a reaction version in practice mode
 * Anything else is home.
 */
export type SiteRoute =
  | { readonly routeName: "home" }
  | { readonly routeName: "daily" }
  | { readonly routeName: "progress" }
  | { readonly routeName: "practice"; readonly practiceQuery: string }
  | { readonly routeName: "play"; readonly reactionVersionRef: string };

const DAILY_HASH = "#/daily";
const PROGRESS_HASH = "#/progress";
const PRACTICE_HASH = "#/practice";
const PLAY_HASH_PATTERN = /^#\/play\/([a-z0-9]+(?:-[a-z0-9]+)*@[1-9][0-9]*)$/;

export function parseSiteRoute(locationHash: string): SiteRoute {
  if (locationHash === DAILY_HASH) {
    return { routeName: "daily" };
  }
  if (locationHash === PROGRESS_HASH) {
    return { routeName: "progress" };
  }
  if (locationHash === PRACTICE_HASH || locationHash.startsWith(`${PRACTICE_HASH}?`)) {
    return { routeName: "practice", practiceQuery: locationHash.slice(PRACTICE_HASH.length + 1) };
  }
  const playMatch = PLAY_HASH_PATTERN.exec(locationHash);
  return playMatch?.[1] === undefined
    ? { routeName: "home" }
    : { routeName: "play", reactionVersionRef: playMatch[1] };
}

export function siteRouteHash(route: SiteRoute): string {
  switch (route.routeName) {
    case "play":
      return `#/play/${route.reactionVersionRef}`;
    case "daily":
      return DAILY_HASH;
    case "progress":
      return PROGRESS_HASH;
    case "practice":
      return route.practiceQuery === "" ? PRACTICE_HASH : `${PRACTICE_HASH}?${route.practiceQuery}`;
    case "home":
      return "#/";
  }
}
