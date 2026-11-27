/**
 * The tabs of the top bar, the same on the learner site and on Create (docs/SPEC.md §5, "Create"),
 * so that the two read as one site: Home · Daily · Learn · Practice · Progress · Create.
 *
 * Addresses
 *   learnerSiteAddress  "" on the learner site (its pages are hash routes); the site's address on
 *                       Create (VITE_LEARNER_SITE_ADDRESS); null where it is unknown, which
 *                       leaves the learner pages' tabs out.
 *   createAddress       Create's address on the learner site (VITE_CREATE_ADDRESS, from the
 *                       BACKEND_URL repository variable); "/" on Create itself; null leaves the
 *                       Create tab out.
 *
 * About (2026-11-27): a link just left of the theme switch, to the learner site's About page (the
 * source code, the licences, the credits). Where the learner site's address is unknown it links
 * the source code itself, which the AGPL asks every user of the running site to be offered.
 */

export type NavigationTabName =
  "home" | "daily" | "learn" | "practice" | "progress" | "create" | "about";

/** The public repository: the source code of both sites. */
export const SOURCE_CODE_ADDRESS = "https://github.com/aberki1234/arrow_pushing";

export interface NavigationTab {
  readonly tabName: NavigationTabName;
  readonly label: string;
  readonly href: string;
}

const LEARNER_TABS: readonly { tabName: NavigationTabName; label: string; hash: string }[] = [
  { tabName: "home", label: "Home", hash: "#/" },
  { tabName: "daily", label: "Daily", hash: "#/daily" },
  { tabName: "learn", label: "Learn", hash: "#/learn" },
  { tabName: "practice", label: "Practice", hash: "#/practice" },
  { tabName: "progress", label: "Progress", hash: "#/progress" },
];

/** An address with "/" at the end ("" stays "", for the learner site's own hash links). */
function withTrailingSlash(address: string): string {
  return address === "" || address.endsWith("/") ? address : `${address}/`;
}

export function navigationTabs(addresses: {
  readonly learnerSiteAddress: string | null;
  readonly createAddress: string | null;
}): NavigationTab[] {
  const { learnerSiteAddress, createAddress } = addresses;
  const learnerTabs =
    learnerSiteAddress === null
      ? []
      : LEARNER_TABS.map(({ tabName, label, hash }) => ({
          tabName,
          label,
          href: `${withTrailingSlash(learnerSiteAddress)}${hash}`,
        }));
  const createTabs =
    createAddress === null
      ? []
      : [{ tabName: "create" as const, label: "Create", href: withTrailingSlash(createAddress) }];
  return [...learnerTabs, ...createTabs];
}

/** The About link of the top bar (see the module comment). */
export function aboutLink(learnerSiteAddress: string | null): NavigationTab {
  return learnerSiteAddress === null
    ? { tabName: "about", label: "Source code", href: SOURCE_CODE_ADDRESS }
    : { tabName: "about", label: "About", href: `${withTrailingSlash(learnerSiteAddress)}#/about` };
}

/** Everything a top bar links (SiteHeader's tabs and about), from the two sites' addresses. */
export function topBarLinks(addresses: {
  readonly learnerSiteAddress: string | null;
  readonly createAddress: string | null;
}): { tabs: NavigationTab[]; about: NavigationTab } {
  return { tabs: navigationTabs(addresses), about: aboutLink(addresses.learnerSiteAddress) };
}
