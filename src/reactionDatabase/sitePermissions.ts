/**
 * What each site role may do (docs/SPEC.md §5, "Create": every "may this user …" decision on the
 * server is here, so that contributors (item 8e) need no new checks elsewhere).
 *
 * Site roles (the users table's site_role)
 *   owner        everything.
 *   reviewer     everything an owner does today; owner-only actions (managing users) come in 8e.
 *   contributor  works on their own reactions and submits them for review.
 * "Their own" (saving a draft, Edit as the next version) is the reaction owner check of
 * reactionVersions.ts, which every role passes through; the owner role does not bypass it.
 */
import type { SiteRole } from "./databaseTables.js";

export type SiteAction =
  "createReactions" | "seeEveryReaction" | "submitForReview" | "publish" | "review";

export const SITE_ACTIONS: readonly SiteAction[] = [
  "createReactions",
  "seeEveryReaction",
  "submitForReview",
  "publish",
  "review",
];

const SITE_ROLE_TO_ACTIONS: Readonly<Record<SiteRole, readonly SiteAction[]>> = {
  owner: SITE_ACTIONS,
  reviewer: SITE_ACTIONS,
  contributor: ["createReactions", "submitForReview"],
};

export function mayPerform(siteRole: SiteRole, siteAction: SiteAction): boolean {
  return SITE_ROLE_TO_ACTIONS[siteRole].includes(siteAction);
}

/** Every site action `siteRole` may perform, in SITE_ACTIONS order. */
export function siteActionsOf(siteRole: SiteRole): SiteAction[] {
  return SITE_ACTIONS.filter((siteAction) => mayPerform(siteRole, siteAction));
}
