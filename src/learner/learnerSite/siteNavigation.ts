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
 */

export type NavigationTabName = "home" | "daily" | "learn" | "practice" | "progress" | "create";

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
