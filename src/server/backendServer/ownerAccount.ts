/**
 * The owner as a user of the database, for the command line's `import` (commandLine.ts): the user
 * whose GitHub sign-in account (accounts.provider_id "github") has the allow-list's first id.
 * The owner must have signed in once, so that Better Auth made the user and the account.
 */
import type { ReactionDatabase } from "../reactionDatabase/model/databaseTables.js";

export class OwnerAccountError extends Error {
  override readonly name = "OwnerAccountError";
}

/** The user id signed in with GitHub user `githubUserId`. Throws OwnerAccountError if none. */
export async function userIdForGithubAccount(
  database: ReactionDatabase,
  githubUserId: string,
): Promise<string> {
  const githubAccount = await database
    .selectFrom("arrowpush.accounts")
    .select("userId")
    .where("providerId", "=", "github")
    .where("accountId", "=", githubUserId)
    .executeTakeFirst();
  if (githubAccount === undefined) {
    throw new OwnerAccountError(
      `GitHub user ${githubUserId} has not signed in yet: sign in to the editor once, then rerun`,
    );
  }
  return githubAccount.userId;
}
