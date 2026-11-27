/**
 * A connection to the real Postgres (Supabase, through its pooler; docs/SPEC.md §5, backend), with
 * node-postgres. Tests use PGlite instead (testSupport/temporaryDatabase.ts).
 */
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import {
  type ArrowpushTables,
  CAMEL_CASE_PLUGIN,
  type DatabaseConnection,
} from "../model/databaseTables.js";

/** A connection pool for `databaseUrl` (a postgres:// connection string). */
export function newPostgresConnection(databaseUrl: string): DatabaseConnection {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const database = new Kysely<ArrowpushTables>({
    dialect: new PostgresDialect({ pool }),
    plugins: [CAMEL_CASE_PLUGIN],
  });
  return {
    database,
    runSqlScript: async (sqlScript: string): Promise<void> => {
      // A query without parameters may hold several statements (the simple query protocol).
      await pool.query(sqlScript);
    },
    close: (): Promise<void> => database.destroy(),
  };
}
