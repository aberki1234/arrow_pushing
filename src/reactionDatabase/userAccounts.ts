/**
 * Users of the editor, known by their sign-in account (OAuth = open authorization, the sign-in
 * protocol GitHub offers): the provider ("github") and the provider's id for the account.
 */
import type { ReactionDatabase, SiteRole } from "./databaseTables.js";

export interface UserIdentity {
  readonly oauthProvider: string;
  /** The provider's own id for the account (GitHub's numeric user id, as text). */
  readonly oauthSubject: string;
  readonly displayName: string;
  /** Used only when the user is new; an existing user keeps their role. */
  readonly siteRole: SiteRole;
}

/** The id of the user with this account, made first if there is none. */
export async function findOrCreateUser(
  database: ReactionDatabase,
  identity: UserIdentity,
): Promise<string> {
  const existingUser = await database
    .selectFrom("arrowpush.users")
    .select("id")
    .where("oauthProvider", "=", identity.oauthProvider)
    .where("oauthSubject", "=", identity.oauthSubject)
    .executeTakeFirst();
  if (existingUser !== undefined) {
    return existingUser.id;
  }
  const insertedUser = await database
    .insertInto("arrowpush.users")
    .values({ ...identity })
    .returning("id")
    .executeTakeFirstOrThrow();
  return insertedUser.id;
}
