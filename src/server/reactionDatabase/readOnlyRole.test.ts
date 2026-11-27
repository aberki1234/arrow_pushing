/**
 * Tests for migrations/0002_read_only_role.sql: the role arrowpush_readonly, which the weekly
 * pg_dump uses (.github/workflows/database-upkeep.yml), reads every row of every table and writes
 * nothing, while row-level security still hides the rows from any other role.
 * The reference is Postgres itself (PGlite): its catalogue (pg_policies, has_table_privilege) and
 * the rows a query sees after SET LOCAL ROLE.
 */
import { type Kysely, sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DATABASE_SETUP_TIMEOUT_MS,
  emptyAllTables,
  insertUser,
  newMigratedDatabase,
  newPgliteConnection,
} from "../../testSupport/temporaryDatabase.js";
import type { ArrowpushTables, DatabaseConnection } from "./databaseTables.js";
import { applyMigrations } from "./migrationRunning.js";

const READ_ONLY_ROLE = "arrowpush_readonly";

let connection: DatabaseConnection;

beforeAll(async () => {
  connection = await newMigratedDatabase();
  // A role that may SELECT but has no policy: row-level security must hide every row from it.
  await connection.runSqlScript(
    "CREATE ROLE other_reader NOLOGIN;\n" +
      "GRANT USAGE ON SCHEMA arrowpush TO other_reader;\n" +
      "GRANT SELECT ON ALL TABLES IN SCHEMA arrowpush TO other_reader;",
  );
}, DATABASE_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await connection.close();
});

beforeEach(async () => {
  await emptyAllTables(connection);
});

/** Every table in the schema arrowpush, by name. */
async function arrowpushTableNames(): Promise<string[]> {
  const tableRows = await sql<{ tableName: string }>`
    SELECT tablename AS table_name FROM pg_tables WHERE schemaname = 'arrowpush'
    ORDER BY tablename`.execute(connection.database);
  return tableRows.rows.map((tableRow) => tableRow.tableName);
}

/** The number of rows of each table that `roleName` sees. */
async function rowCountsAs(roleName: string): Promise<Record<string, number>> {
  const tableNames = await arrowpushTableNames();
  return connection.database.transaction().execute(async (transaction) => {
    await sql`SET LOCAL ROLE ${sql.id(roleName)}`.execute(transaction);
    const tableToRowCount: Record<string, number> = {};
    for (const tableName of tableNames) {
      const countRows = await sql<{ rowCount: number }>`
        SELECT count(*)::int AS row_count FROM ${sql.table(`arrowpush.${tableName}`)}`.execute(
        transaction,
      );
      tableToRowCount[tableName] = countRows.rows[0]?.rowCount ?? -1;
    }
    return tableToRowCount;
  });
}

/** One query, run inside a transaction. */
type StatementInTransaction = (transaction: Kysely<ArrowpushTables>) => Promise<unknown>;

/** Run `statement` as the read-only role; returns Postgres's error message, or "" if it ran. */
async function refusalAsReadOnlyRole(statement: StatementInTransaction): Promise<string> {
  try {
    await connection.database.transaction().execute(async (transaction) => {
      await sql`SET LOCAL ROLE ${sql.id(READ_ONLY_ROLE)}`.execute(transaction);
      await statement(transaction);
    });
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe("the catalogue", () => {
  it("gives every table row-level security, SELECT and a read policy for the role", async () => {
    const policyRows = await sql<{ tableName: string }>`
      SELECT tablename AS table_name FROM pg_policies
      WHERE schemaname = 'arrowpush' AND cmd = 'SELECT' AND ${READ_ONLY_ROLE} = ANY (roles)
      ORDER BY tablename`.execute(connection.database);
    const tableNames = await arrowpushTableNames();
    expect(tableNames.length).toBeGreaterThan(7);
    expect(policyRows.rows.map((policyRow) => policyRow.tableName)).toEqual(tableNames);
    for (const tableName of tableNames) {
      const privilegeRows = await sql<{ maySelect: boolean; mayInsert: boolean }>`
        SELECT has_table_privilege(${READ_ONLY_ROLE}, ${`arrowpush.${tableName}`}, 'SELECT')
                 AS may_select,
               has_table_privilege(${READ_ONLY_ROLE}, ${`arrowpush.${tableName}`}, 'INSERT')
                 AS may_insert`.execute(connection.database);
      expect(privilegeRows.rows[0], tableName).toEqual({ maySelect: true, mayInsert: false });
    }
  });
});

describe("reading and writing as the read-only role", () => {
  it("sees every row the owner sees; a role without a policy sees none", async () => {
    const ownerUserId = await insertUser(connection, "owner");
    await connection.database
      .insertInto("arrowpush.reactions")
      .values({ reactionSlug: "sn2-test", ownerUserId })
      .execute();
    const ownerCounts = await rowCountsAs("postgres");
    expect(ownerCounts).toMatchObject({ users: 1, reactions: 1 });
    expect(ownerCounts.applied_migrations).toBeGreaterThan(0);
    expect(await rowCountsAs(READ_ONLY_ROLE)).toEqual(ownerCounts);
    const otherCounts = await rowCountsAs("other_reader");
    expect(Object.values(otherCounts).every((rowCount) => rowCount === 0)).toBe(true);
  });

  it("refuses to insert, update or delete", async () => {
    const ownerUserId = await insertUser(connection, "owner");
    const statements: StatementInTransaction[] = [
      (transaction): Promise<unknown> =>
        transaction
          .insertInto("arrowpush.reactions")
          .values({ reactionSlug: "x", ownerUserId })
          .execute(),
      (transaction): Promise<unknown> =>
        transaction.updateTable("arrowpush.users").set({ name: "renamed" }).execute(),
      (transaction): Promise<unknown> => transaction.deleteFrom("arrowpush.users").execute(),
    ];
    for (const statement of statements) {
      expect(await refusalAsReadOnlyRole(statement)).toMatch(/permission denied/);
    }
  });
});

describe("a role made beforehand", () => {
  it(
    "applies when the owner made the role first, with LOGIN, and keeps its LOGIN",
    async () => {
      const supabaseLikeConnection = newPgliteConnection();
      try {
        await supabaseLikeConnection.runSqlScript(
          `CREATE ROLE ${READ_ONLY_ROLE} LOGIN PASSWORD 'made-by-the-owner';`,
        );
        expect(await applyMigrations(supabaseLikeConnection)).toContain("0002_read_only_role.sql");
        const roleRows = await sql<{ canLogIn: boolean }>`
        SELECT rolcanlogin AS can_log_in FROM pg_roles WHERE rolname = ${READ_ONLY_ROLE}`.execute(
          supabaseLikeConnection.database,
        );
        expect(roleRows.rows).toEqual([{ canLogIn: true }]);
      } finally {
        await supabaseLikeConnection.close();
      }
    },
    DATABASE_SETUP_TIMEOUT_MS,
  );
});
