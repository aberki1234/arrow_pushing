/**
 * The Postgres tables of the editor and submissions (docs/schema-design.md §8), as Kysely types.
 *
 * Terms
 *   submission status  draft, submitted, changes_requested or published: where a reaction version
 *                      is on its way to learners. Not a step's route preference.
 *   site role          contributor, reviewer or owner: what a signed-in user may do.
 *   database connection  A Kysely query builder over one Postgres (node-postgres on the server,
 *                      PGlite in tests), plus a way to run a whole SQL script (the migrations).
 *
 * SQL is snake_case and TypeScript camelCase: CAMEL_CASE_PLUGIN translates names, but leaves the
 * keys inside JSONB values (the reaction document, the lint report) as they are.
 */
import { CamelCasePlugin, type ColumnType, type Generated, type Kysely } from "kysely";

export type SiteRole = "contributor" | "reviewer" | "owner";

export type SubmissionStatus = "draft" | "submitted" | "changes_requested" | "published";

/** A JSONB column: read as parsed JSON, written as JSON text. */
type JsonColumn<ReadShape> = ColumnType<ReadShape, string, string>;

/** A timestamptz column with a default: read as a Date, written as a Date or left out. */
type TimestampWithDefault = ColumnType<Date, Date | undefined, Date>;

export interface UsersTable {
  readonly id: Generated<string>;
  displayName: string;
  oauthProvider: string;
  oauthSubject: string;
  siteRole: SiteRole;
  createdAt: TimestampWithDefault;
}

export interface ReactionsTable {
  readonly id: Generated<string>;
  reactionSlug: string;
  ownerUserId: string;
  createdAt: TimestampWithDefault;
}

export interface ReactionVersionsTable {
  reactionId: string;
  reactionVersion: number;
  submissionStatus: SubmissionStatus;
  reactionDocument: JsonColumn<Record<string, unknown>>;
  formatVersion: number;
  contentHash: string | null;
  authorUserId: string;
  licenceAgreedAt: Date | null;
  latestLintReport: JsonColumn<unknown> | null;
  createdAt: TimestampWithDefault;
  updatedAt: TimestampWithDefault;
  submittedAt: Date | null;
  publishedAt: Date | null;
}

export interface ReviewsTable {
  readonly id: Generated<string>;
  reactionId: string;
  reactionVersion: number;
  reviewerUserId: string;
  reviewDecision: "publish" | "changes_requested";
  comment: string | null;
  createdAt: TimestampWithDefault;
}

export interface SessionsTable {
  id: string;
  userId: string;
  createdAt: TimestampWithDefault;
  expiresAt: Date;
}

export interface AppliedMigrationsTable {
  migrationName: string;
  appliedAt: TimestampWithDefault;
}

/** Every table, by its schema-qualified name (Kysely snake-cases each part). */
export interface ArrowpushTables {
  "arrowpush.users": UsersTable;
  "arrowpush.reactions": ReactionsTable;
  "arrowpush.reactionVersions": ReactionVersionsTable;
  "arrowpush.reviews": ReviewsTable;
  "arrowpush.sessions": SessionsTable;
  "arrowpush.appliedMigrations": AppliedMigrationsTable;
}

export type ReactionDatabase = Kysely<ArrowpushTables>;

/** Name translation for every connection; JSONB contents keep their own keys. */
export const CAMEL_CASE_PLUGIN = new CamelCasePlugin({ maintainNestedObjectKeys: true });

export interface DatabaseConnection {
  readonly database: ReactionDatabase;
  /** Run a script of several SQL statements, without parameters (a migration file). */
  runSqlScript(sqlScript: string): Promise<void>;
  close(): Promise<void>;
}
