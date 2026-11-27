/**
 * Site users: the site role check every database operation makes, and the owner's Users page
 * (docs/SPEC.md §6, "Contributors").
 *
 * Rules
 *   - Only the owner lists users and changes roles (manageUsers).
 *   - Roles given on the Users page: contributor, reviewer, blocked. Nobody is made owner there,
 *     and the owner's own role does not change (the owner is named by ALLOWED_GITHUB_USER_IDS).
 */
import { sql } from "kysely";
import type { ReactionDatabase, SiteRole } from "./databaseTables.js";
import { ReactionDatabaseError } from "./reactionDatabaseErrors.js";
import { mayPerform, type SiteAction } from "./sitePermissions.js";

export interface SiteUser {
  readonly userId: string;
  readonly displayName: string;
  /** The sign-in providers of their accounts ("github", "google"). */
  readonly providers: readonly string[];
  readonly siteRole: SiteRole;
  readonly joinedAt: Date;
  readonly openVersionCount: number;
  readonly publishedVersionCount: number;
}

const ASSIGNABLE_ROLES: readonly SiteRole[] = ["contributor", "reviewer", "blocked"];

/** The user's site role, or undefined for an unknown user. */
export async function siteRoleOf(
  database: ReactionDatabase,
  userId: string,
): Promise<SiteRole | undefined> {
  const userRow = await database
    .selectFrom("arrowpush.users")
    .select("siteRole")
    .where("id", "=", userId)
    .executeTakeFirst();
  return userRow?.siteRole;
}

/** Refuses (not-allowed) unless the user exists and their role may perform `siteAction`. */
export async function requireSiteAction(
  database: ReactionDatabase,
  userId: string,
  siteAction: SiteAction,
): Promise<SiteRole> {
  const siteRole = await siteRoleOf(database, userId);
  if (siteRole === undefined || !mayPerform(siteRole, siteAction)) {
    throw new ReactionDatabaseError("not-allowed", `this user may not ${siteAction}`);
  }
  return siteRole;
}

/** Every user, oldest first. Refusal: not-allowed (anyone but the owner). */
export async function listSiteUsers(
  database: ReactionDatabase,
  ownerUserId: string,
): Promise<SiteUser[]> {
  await requireSiteAction(database, ownerUserId, "manageUsers");
  const userRows = await database
    .selectFrom("arrowpush.users as member")
    .select([
      "member.id as userId",
      "member.name as displayName",
      "member.siteRole",
      "member.createdAt as joinedAt",
      sql<string[]>`coalesce((SELECT array_agg(DISTINCT account.provider_id
          ORDER BY account.provider_id) FROM arrowpush.accounts account
          WHERE account.user_id = member.id), '{}')`.as("providers"),
      sql<number>`(SELECT count(*)::int FROM arrowpush.reaction_versions version
          WHERE version.author_user_id = member.id
            AND version.submission_status <> 'published')`.as("openVersionCount"),
      sql<number>`(SELECT count(*)::int FROM arrowpush.reaction_versions version
          WHERE version.author_user_id = member.id
            AND version.submission_status = 'published')`.as("publishedVersionCount"),
    ])
    .orderBy("member.createdAt")
    .orderBy("member.name")
    .execute();
  return userRows;
}

/**
 * The owner gives a user a role. Refusals: not-allowed (anyone but the owner),
 * role-not-assignable (owner, or the owner's own role), user-not-found.
 */
export async function setSiteRole(
  database: ReactionDatabase,
  change: { readonly ownerUserId: string; readonly userId: string; readonly siteRole: SiteRole },
): Promise<void> {
  await requireSiteAction(database, change.ownerUserId, "manageUsers");
  if (!ASSIGNABLE_ROLES.includes(change.siteRole)) {
    throw new ReactionDatabaseError(
      "role-not-assignable",
      `"${change.siteRole}" is not given here`,
    );
  }
  const currentRole = await siteRoleOf(database, change.userId);
  if (currentRole === undefined) {
    throw new ReactionDatabaseError("user-not-found", `no user ${change.userId}`);
  }
  if (currentRole === "owner") {
    throw new ReactionDatabaseError("role-not-assignable", "the owner's role does not change");
  }
  await database
    .updateTable("arrowpush.users")
    .set({ siteRole: change.siteRole, updatedAt: new Date() })
    .where("id", "=", change.userId)
    .execute();
}
