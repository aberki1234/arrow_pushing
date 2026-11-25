/**
 * Bring a database up to date with the SQL migrations in ./migrations.
 *
 * Steps
 *   1. Make the schema arrowpush and its table applied_migrations if they are missing.
 *   2. Run each migration file not yet recorded there, in file-name order ("0001_…", "0002_…"),
 *      each in one transaction together with its record, so a failed migration leaves no trace.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DatabaseConnection } from "./databaseTables.js";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "migrations");

/** "0001_arrowpush_tables.sql": four digits, then snake_case words. Safe to quote into SQL. */
const MIGRATION_FILE_NAME_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;

const BOOKKEEPING_SQL = `
CREATE SCHEMA IF NOT EXISTS arrowpush;
CREATE TABLE IF NOT EXISTS arrowpush.applied_migrations (
  migration_name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE arrowpush.applied_migrations ENABLE ROW LEVEL SECURITY;`;

function migrationFileNames(): string[] {
  return readdirSync(migrationsFolder)
    .filter((fileName) => MIGRATION_FILE_NAME_PATTERN.test(fileName))
    .sort();
}

/**
 * Apply every migration not applied yet; returns the names of those applied now (e.g.
 * ["0001_arrowpush_tables.sql"]), empty when the database was already up to date.
 */
export async function applyMigrations(connection: DatabaseConnection): Promise<string[]> {
  await connection.runSqlScript(BOOKKEEPING_SQL);
  const appliedRows = await connection.database
    .selectFrom("arrowpush.appliedMigrations")
    .select("migrationName")
    .execute();
  const alreadyApplied = new Set(appliedRows.map((appliedRow) => appliedRow.migrationName));
  const appliedNow: string[] = [];
  for (const migrationName of migrationFileNames()) {
    if (alreadyApplied.has(migrationName)) {
      continue;
    }
    const migrationSql = readFileSync(join(migrationsFolder, migrationName), "utf-8");
    await connection.runSqlScript(
      `BEGIN;\n${migrationSql}\n` +
        `INSERT INTO arrowpush.applied_migrations (migration_name) VALUES ('${migrationName}');\n` +
        "COMMIT;",
    );
    appliedNow.push(migrationName);
  }
  return appliedNow;
}
