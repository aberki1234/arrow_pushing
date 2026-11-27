/** Tests for accessTokens.ts: personal access tokens (SPEC §6, "Drafting with an assistant"). */
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import {
  DATABASE_SETUP_TIMEOUT_MS,
  emptyAllTables,
  insertUser,
  newMigratedDatabase,
} from "../../../testSupport/temporaryDatabase.js";
import {
  accessTokenSha256,
  mintAccessToken,
  revokeAccessToken,
  userOfAccessToken,
} from "./accessTokens.js";
import type { DatabaseConnection, ReactionDatabase } from "../model/databaseTables.js";
import { ReactionDatabaseError } from "../model/reactionDatabaseErrors.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINTED_AT = new Date("2026-11-26T12:00:00Z");

let connection: DatabaseConnection;
let database: ReactionDatabase;
let ownerUserId: string;

beforeAll(async () => {
  connection = await newMigratedDatabase();
  database = connection.database;
}, DATABASE_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await connection.close();
});

beforeEach(async () => {
  await emptyAllTables(connection);
  ownerUserId = await insertUser(connection, "Owner Name");
});

function mintForOwner(lifetimeDays = 30): ReturnType<typeof mintAccessToken> {
  return mintAccessToken(database, {
    userEmail: "Owner-Name@example.com",
    tokenName: "drafting",
    lifetimeDays,
    now: MINTED_AT,
  });
}

it("mints a token shown once, stores only its SHA-256 and finds its user", async () => {
  const mintedToken = await mintForOwner();
  expect(mintedToken.plainToken).toMatch(/^ap_[A-Za-z0-9_-]{43}$/);
  expect(mintedToken.expiresAt).toEqual(new Date(MINTED_AT.getTime() + 30 * DAY_MS));
  const stored = await database.selectFrom("arrowpush.accessTokens").selectAll().execute();
  expect(stored).toHaveLength(1);
  expect(stored[0]?.tokenSha256).toBe(accessTokenSha256(mintedToken.plainToken));
  expect(JSON.stringify(stored)).not.toContain(mintedToken.plainToken);

  const usedAt = new Date(MINTED_AT.getTime() + DAY_MS);
  expect(await userOfAccessToken(database, mintedToken.plainToken, usedAt)).toEqual({
    userId: ownerUserId,
    displayName: "Owner Name",
    siteRole: "owner",
  });
  const afterUse = await database.selectFrom("arrowpush.accessTokens").selectAll().execute();
  expect(afterUse[0]?.lastUsedAt).toEqual(usedAt);
});

it("finds no user for an unknown, expired or revoked token", async () => {
  const mintedToken = await mintForOwner(1);
  expect(await userOfAccessToken(database, "ap_not-a-token", MINTED_AT)).toBeUndefined();
  const afterExpiry = new Date(MINTED_AT.getTime() + 2 * DAY_MS);
  expect(await userOfAccessToken(database, mintedToken.plainToken, afterExpiry)).toBeUndefined();

  const secondToken = await mintForOwner();
  await revokeAccessToken(database, secondToken.accessTokenId, MINTED_AT);
  expect(await userOfAccessToken(database, secondToken.plainToken, MINTED_AT)).toBeUndefined();
});

it("refuses an unknown email, a lifetime out of range, or revoking no token", async () => {
  const refusalOf = async (pending: Promise<unknown>): Promise<string> => {
    const refusal: unknown = await pending.then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(refusal).toBeInstanceOf(ReactionDatabaseError);
    return (refusal as ReactionDatabaseError).refusalCode;
  };
  expect(
    await refusalOf(
      mintAccessToken(database, {
        userEmail: "nobody@example.com",
        tokenName: "drafting",
        lifetimeDays: 30,
        now: MINTED_AT,
      }),
    ),
  ).toBe("user-not-found");
  expect(await refusalOf(mintForOwner(0))).toBe("not-allowed");
  expect(await refusalOf(mintForOwner(366))).toBe("not-allowed");
  expect(
    await refusalOf(revokeAccessToken(database, "00000000-0000-0000-0000-000000000000", MINTED_AT)),
  ).toBe("access-token-not-found");
  expect(await refusalOf(revokeAccessToken(database, "not-an-id", MINTED_AT))).toBe(
    "access-token-not-found",
  );
});
