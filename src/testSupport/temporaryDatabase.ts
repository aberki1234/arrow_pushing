/**
 * A Postgres database for tests: PGlite (Postgres compiled to WebAssembly, in memory), migrated,
 * one per test file (docs/SPEC.md §5, backend). emptyAllTables() gives each test a clean start.
 */
import { PGlite } from "@electric-sql/pglite";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import {
  type ArrowpushTables,
  CAMEL_CASE_PLUGIN,
  type DatabaseConnection,
} from "../reactionDatabase/databaseTables.js";
import { applyMigrations } from "../reactionDatabase/migrationRunning.js";

/**
 * Time limit for a beforeAll() that makes a database. PGlite's start sets up a new data folder
 * (initdb): about 7 s alone on the development laptop (WSL), longer beside other test files.
 */
export const DATABASE_SETUP_TIMEOUT_MS = 60_000;

/** A connection to a fresh in-memory database, not yet migrated. */
export function newPgliteConnection(): DatabaseConnection {
  const pglite = new PGlite();
  const database = new Kysely<ArrowpushTables>({
    dialect: new PGliteDialect(pglite),
    plugins: [CAMEL_CASE_PLUGIN],
  });
  return {
    database,
    runSqlScript: async (sqlScript: string): Promise<void> => {
      await pglite.exec(sqlScript);
    },
    close: (): Promise<void> => database.destroy(),
  };
}

/** A fresh in-memory database with every migration applied. */
export async function newMigratedDatabase(): Promise<DatabaseConnection> {
  const connection = newPgliteConnection();
  await applyMigrations(connection);
  return connection;
}

/** Remove every row (TRUNCATE fires no row trigger, so published versions go too). */
export async function emptyAllTables(connection: DatabaseConnection): Promise<void> {
  await connection.runSqlScript(
    "TRUNCATE arrowpush.reviews, arrowpush.sessions, arrowpush.reaction_versions, " +
      "arrowpush.reactions, arrowpush.users;",
  );
}

/** A user with the given role, for tests. */
export async function insertUser(
  connection: DatabaseConnection,
  displayName: string,
  siteRole: "contributor" | "reviewer" | "owner" = "owner",
): Promise<string> {
  const insertedUser = await connection.database
    .insertInto("arrowpush.users")
    .values({ displayName, oauthProvider: "github", oauthSubject: displayName, siteRole })
    .returning("id")
    .executeTakeFirstOrThrow();
  return insertedUser.id;
}
