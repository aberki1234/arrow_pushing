/**
 * The learner site's routes, kept in the URL hash so the site works from any static host:
 *   #/                                  home
 *   #/daily                             today's daily puzzle
 *   #/practice[?type=…&difficulty=…&status=…&search=…]   the practice list and its filters
 *   #/progress                          the learner's progress
 *   #/play/<slug>@<version>             play a reaction version in practice mode
 *   #/learn[/<track>[/<problem set>[/<reaction slug>]]]   the Learn tracks, a track, a problem
 *                                       set, and its latest version played from that problem set
 * Anything else is home.
 */
export type SiteRoute =
  | { readonly routeName: "home" }
  | { readonly routeName: "daily" }
  | { readonly routeName: "progress" }
  | { readonly routeName: "practice"; readonly practiceQuery: string }
  | { readonly routeName: "play"; readonly reactionVersionRef: string }
  | {
      readonly routeName: "learn";
      /** null: the list of tracks. */
      readonly trackSlug: string | null;
      /** null: the track's page. */
      readonly problemSetSlug: string | null;
      /** null: the problem set's page; otherwise its latest version is played. */
      readonly reactionSlug: string | null;
    };

const DAILY_HASH = "#/daily";
const PROGRESS_HASH = "#/progress";
const PRACTICE_HASH = "#/practice";
const PLAY_HASH_PATTERN = /^#\/play\/([a-z0-9]+(?:-[a-z0-9]+)*@[1-9][0-9]*)$/;
const LEARN_HASH = "#/learn";
// Up to three slugs after #/learn: a track, a problem set and a reaction.
const LEARN_HASH_PATTERN = /^#\/learn((?:\/[a-z0-9]+(?:-[a-z0-9]+)*){0,3})$/;

/** The Learn route of a hash, or null if it is not one. */
function parsedLearnRoute(locationHash: string): SiteRoute | null {
  const learnMatch = LEARN_HASH_PATTERN.exec(locationHash);
  if (learnMatch === null) {
    return null;
  }
  const [trackSlug = null, problemSetSlug = null, reactionSlug = null] = (learnMatch[1] ?? "")
    .split("/")
    .slice(1);
  return { routeName: "learn", trackSlug, problemSetSlug, reactionSlug };
}

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
  const learnRoute = parsedLearnRoute(locationHash);
  if (learnRoute !== null) {
    return learnRoute;
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
    case "learn":
      return [LEARN_HASH, route.trackSlug, route.problemSetSlug, route.reactionSlug]
        .filter((part) => part !== null)
        .join("/");
    case "home":
      return "#/";
  }
}
