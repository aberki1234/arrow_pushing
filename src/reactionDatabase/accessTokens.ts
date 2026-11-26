/**
 * Personal access tokens (docs/SPEC.md §6, "Drafting with an assistant"; build item 10b).
 *
 * Terms
 *   access token  `ap_` + 32 random bytes in base64url, standing for one user. What a token may
 *                 do is decided by the server (backendServer/accessTokenRequests.ts): read that
 *                 user's reactions and save drafts, nothing else.
 * Rules
 *   - Only the token's SHA-256 is stored; the plain token is returned once, at minting.
 *   - A token expires (1 to 365 days after minting) and can be revoked; either ends it for good.
 *   - Each use records last_used_at.
 */
import { createHash, randomBytes } from "node:crypto";
import type { ReactionDatabase, SiteRole } from "./databaseTables.js";
import { ReactionDatabaseError } from "./reactionDatabaseErrors.js";

const TOKEN_PREFIX = "ap_";
const TOKEN_RANDOM_BYTES = 32;
const MAXIMUM_LIFETIME_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The user a token stands for (the server's SignedInUser). */
export interface AccessTokenUser {
  readonly userId: string;
  readonly displayName: string;
  readonly siteRole: SiteRole;
}

export interface AccessTokenRequest {
  readonly userEmail: string;
  /** What the token is for, for its owner's records ("drafting"). */
  readonly tokenName: string;
  readonly lifetimeDays: number;
  readonly now: Date;
}

export interface MintedAccessToken {
  readonly accessTokenId: string;
  /** Shown once: it is not stored. */
  readonly plainToken: string;
  readonly expiresAt: Date;
}

export function accessTokenSha256(plainToken: string): string {
  return createHash("sha256").update(plainToken, "utf8").digest("hex");
}

/** A new token for the user with `userEmail`. Refuses user-not-found, or not-allowed (lifetime). */
export async function mintAccessToken(
  database: ReactionDatabase,
  request: AccessTokenRequest,
): Promise<MintedAccessToken> {
  const { lifetimeDays } = request;
  if (!Number.isInteger(lifetimeDays) || lifetimeDays < 1 || lifetimeDays > MAXIMUM_LIFETIME_DAYS) {
    throw new ReactionDatabaseError(
      "not-allowed",
      `a token lasts 1 to ${String(MAXIMUM_LIFETIME_DAYS)} days, not ${String(lifetimeDays)}`,
    );
  }
  const user = await database
    .selectFrom("arrowpush.users")
    .select("id")
    .where("email", "=", request.userEmail)
    .executeTakeFirst();
  if (user === undefined) {
    throw new ReactionDatabaseError(
      "user-not-found",
      `no user with the email ${request.userEmail}`,
    );
  }
  const plainToken = TOKEN_PREFIX + randomBytes(TOKEN_RANDOM_BYTES).toString("base64url");
  const expiresAt = new Date(request.now.getTime() + lifetimeDays * DAY_MS);
  const inserted = await database
    .insertInto("arrowpush.accessTokens")
    .values({
      userId: user.id,
      tokenName: request.tokenName,
      tokenSha256: accessTokenSha256(plainToken),
      createdAt: request.now,
      expiresAt,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { accessTokenId: inserted.id, plainToken, expiresAt };
}

/** The user `plainToken` stands for, if it is known, unexpired and not revoked; records the use. */
export async function userOfAccessToken(
  database: ReactionDatabase,
  plainToken: string,
  now: Date,
): Promise<AccessTokenUser | undefined> {
  const found = await database
    .selectFrom("arrowpush.accessTokens")
    .innerJoin("arrowpush.users", "arrowpush.users.id", "arrowpush.accessTokens.userId")
    .select([
      "arrowpush.accessTokens.id as accessTokenId",
      "arrowpush.users.id as userId",
      "arrowpush.users.name as displayName",
      "arrowpush.users.siteRole as siteRole",
    ])
    .where("arrowpush.accessTokens.tokenSha256", "=", accessTokenSha256(plainToken))
    .where("arrowpush.accessTokens.revokedAt", "is", null)
    .where("arrowpush.accessTokens.expiresAt", ">", now)
    .executeTakeFirst();
  if (found === undefined) {
    return undefined;
  }
  await database
    .updateTable("arrowpush.accessTokens")
    .set({ lastUsedAt: now })
    .where("id", "=", found.accessTokenId)
    .execute();
  return { userId: found.userId, displayName: found.displayName, siteRole: found.siteRole };
}

/** End a token for good. Refuses access-token-not-found. */
export async function revokeAccessToken(
  database: ReactionDatabase,
  accessTokenId: string,
  now: Date,
): Promise<void> {
  if (!UUID_PATTERN.test(accessTokenId)) {
    throw new ReactionDatabaseError("access-token-not-found", `no access token ${accessTokenId}`);
  }
  const revoked = await database
    .updateTable("arrowpush.accessTokens")
    .set({ revokedAt: now })
    .where("id", "=", accessTokenId)
    .executeTakeFirst();
  if (revoked.numUpdatedRows === 0n) {
    throw new ReactionDatabaseError("access-token-not-found", `no access token ${accessTokenId}`);
  }
}
