/**
 * Tests for migrationRunning.ts and migrations/0001_arrowpush_tables.sql: the tables of
 * docs/schema-design.md §8 in the schema arrowpush, and the rules the database itself enforces.
 * The reference is §8's table definitions, read from Postgres's own catalogue (PGlite).
 */
import { sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DATABASE_SETUP_TIMEOUT_MS,
  emptyAllTables,
  insertUser,
  newPgliteConnection,
} from "../testSupport/temporaryDatabase.js";
import type { DatabaseConnection } from "./databaseTables.js";
import { applyMigrations } from "./migrationRunning.js";

let connection: DatabaseConnection;
let firstRunMigrationNames: string[];

beforeAll(async () => {
  connection = newPgliteConnection();
  firstRunMigrationNames = await applyMigrations(connection);
}, DATABASE_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await connection.close();
});

beforeEach(async () => {
  await emptyAllTables(connection);
});

const TABLE_NAMES = [
  "accounts",
  "reaction_versions",
  "reactions",
  "reviews",
  "sessions",
  "users",
  "verifications",
];

describe("applying the migrations", () => {
  it("applies every migration on a fresh database and nothing on a second run", async () => {
    expect(firstRunMigrationNames).toEqual([
      "0001_arrowpush_tables.sql",
      "0002_read_only_role.sql",
    ]);
    expect(await applyMigrations(connection)).toEqual([]);
  });

  it("makes every table in the schema arrowpush with row-level security on", async () => {
    const tableRows = await sql<{ tableName: string; rowSecurity: boolean }>`
      SELECT relname AS table_name, relrowsecurity AS row_security
      FROM pg_class JOIN pg_namespace ON pg_namespace.oid = relnamespace
      WHERE nspname = 'arrowpush' AND relkind = 'r' ORDER BY relname`.execute(connection.database);
    const secured = tableRows.rows.filter(
      (tableRow) => tableRow.tableName !== "applied_migrations",
    );
    expect(secured.map((tableRow) => tableRow.tableName)).toEqual(TABLE_NAMES);
    expect(secured.every((tableRow) => tableRow.rowSecurity)).toBe(true);
  });
});

/** A reaction with one version per given status, all by one owner. */
async function reactionWithVersions(statuses: readonly string[]): Promise<string> {
  const ownerUserId = await insertUser(connection, "owner");
  const reaction = await connection.database
    .insertInto("arrowpush.reactions")
    .values({ reactionSlug: "sn2-test", ownerUserId })
    .returning("id")
    .executeTakeFirstOrThrow();
  for (const [position, submissionStatus] of statuses.entries()) {
    const reactionVersion = position + 1;
    const insertVersion = sql`INSERT INTO arrowpush.reaction_versions
      (reaction_id, reaction_version, submission_status, reaction_document, format_version,
       author_user_id)
      VALUES (${reaction.id}, ${reactionVersion}, ${submissionStatus},
              '{}', 1, ${ownerUserId})`;
    await insertVersion.execute(connection.database);
  }
  return reaction.id;
}

describe("rules the database enforces", () => {
  it("refuses a second unpublished version of one reaction", async () => {
    await expect(reactionWithVersions(["published", "draft", "submitted"])).rejects.toThrow(
      /reaction_versions_one_unpublished/,
    );
  });

  it("allows many published versions and one draft", async () => {
    await expect(reactionWithVersions(["published", "published", "draft"])).resolves.toBeTypeOf(
      "string",
    );
  });

  it("refuses an unknown submission status", async () => {
    await expect(reactionWithVersions(["approved"])).rejects.toThrow(/check constraint/);
  });

  it("refuses to update or delete a published version, but not a draft", async () => {
    const reactionId = await reactionWithVersions(["published", "draft"]);
    await expect(
      sql`UPDATE arrowpush.reaction_versions SET reaction_document = '{"changed": true}'
          WHERE reaction_id = ${reactionId} AND reaction_version = 1`.execute(connection.database),
    ).rejects.toThrow(/is published and cannot change/);
    await expect(
      sql`DELETE FROM arrowpush.reaction_versions
          WHERE reaction_id = ${reactionId} AND reaction_version = 1`.execute(connection.database),
    ).rejects.toThrow(/is published and cannot change/);
    await expect(
      sql`UPDATE arrowpush.reaction_versions SET submission_status = 'published'
          WHERE reaction_id = ${reactionId} AND reaction_version = 2`.execute(connection.database),
    ).resolves.toBeDefined();
  });
});
