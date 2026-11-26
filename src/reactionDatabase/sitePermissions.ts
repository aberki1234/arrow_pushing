/**
 * What each site role may do (docs/SPEC.md §5, "Create", and §6, "Contributors"): every "may
 * this user …" decision on the server is here.
 *
 * Site roles (the users table's site_role)
 *   owner        everything: the only one who publishes their own versions directly (without a
 *                review) and who manages users (the Users page).
 *   reviewer     sees every reaction and reviews others' submissions, publishing them or
 *                requesting changes (never their own: submissions.ts); their own versions go
 *                through review like anyone's.
 *   contributor  works on their own versions and submits them for review.
 *   blocked      signs in and sees their drafts; saves and submits nothing.
 * "Their own" (saving a version) is the version author check of reactionVersions.ts, which every
 * role passes through; the owner role does not bypass it.
 */
import type { SiteRole } from "./databaseTables.js";

export type SiteAction =
  "createReactions" | "seeEveryReaction" | "submitForReview" | "publish" | "review" | "manageUsers";

export const SITE_ACTIONS: readonly SiteAction[] = [
  "createReactions",
  "seeEveryReaction",
  "submitForReview",
  "publish",
  "review",
  "manageUsers",
];

const SITE_ROLE_TO_ACTIONS: Readonly<Record<SiteRole, readonly SiteAction[]>> = {
  owner: SITE_ACTIONS,
  reviewer: ["createReactions", "seeEveryReaction", "submitForReview", "review"],
  contributor: ["createReactions", "submitForReview"],
  blocked: [],
};

export function mayPerform(siteRole: SiteRole, siteAction: SiteAction): boolean {
  return SITE_ROLE_TO_ACTIONS[siteRole].includes(siteAction);
}

/** Every site action `siteRole` may perform, in SITE_ACTIONS order. */
export function siteActionsOf(siteRole: SiteRole): SiteAction[] {
  return SITE_ACTIONS.filter((siteAction) => mayPerform(siteRole, siteAction));
}
