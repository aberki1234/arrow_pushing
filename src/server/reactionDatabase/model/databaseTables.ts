/**
 * The Postgres tables of the editor and submissions (docs/schema-design.md §8), as Kysely types.
 *
 * Terms
 *   submission status  draft, submitted, changes_requested or published: where a reaction version
 *                      is on its way to learners. Not a step's route preference.
 *   site role          contributor, reviewer, owner or blocked: what a signed-in user may do
 *                      (sitePermissions.ts).
 *   database connection  A Kysely query builder over one Postgres (node-postgres on the server,
 *                      PGlite in tests), plus a way to run a whole SQL script (the migrations).
 *
 * SQL is snake_case and TypeScript camelCase: CAMEL_CASE_PLUGIN translates names, but leaves the
 * keys inside JSONB values (the reaction document, the lint report) as they are.
 */
import { CamelCasePlugin, type ColumnType, type Generated, type Kysely } from "kysely";

export type SiteRole = "contributor" | "reviewer" | "owner" | "blocked";

export type SubmissionStatus = "draft" | "submitted" | "changes_requested" | "published";

/** A JSONB column: read as parsed JSON, written as JSON text. */
type JsonColumn<ReadShape> = ColumnType<ReadShape, string, string>;

/** A timestamptz column with a default: read as a Date, written as a Date or left out. */
type TimestampWithDefault = ColumnType<Date, Date | undefined, Date>;

/** A signed-in person (Better Auth's user, plus siteRole). `name` is the display name. */
export interface UsersTable {
  readonly id: Generated<string>;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  siteRole: SiteRole;
  createdAt: TimestampWithDefault;
  updatedAt: TimestampWithDefault;
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
  /** The author's note for the reviewer, given at Submit. */
  submissionNote: string | null;
}

/** A reviewer's note pinned to one change of the version (reactionEditing's change list). */
export interface PinnedNote {
  readonly changeKey: string;
  readonly note: string;
}

export interface ReviewsTable {
  readonly id: Generated<string>;
  reactionId: string;
  reactionVersion: number;
  reviewerUserId: string;
  reviewDecision: "publish" | "changes_requested";
  /** The overall note. */
  comment: string | null;
  pinnedNotes: ColumnType<PinnedNote[], string | undefined, string>;
  createdAt: TimestampWithDefault;
}

/** A sign-in session (Better Auth's): the cookie carries `token`, signed. */
export interface SessionsTable {
  readonly id: Generated<string>;
  token: string;
  userId: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: TimestampWithDefault;
  updatedAt: Date;
}

/** A sign-in account of a user (Better Auth's): GitHub's user id is accountId. */
export interface AccountsTable {
  readonly id: Generated<string>;
  accountId: string;
  providerId: string;
  userId: string;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  scope: string | null;
  password: string | null;
  createdAt: TimestampWithDefault;
  updatedAt: Date;
}

/** A short-lived value of the sign-in flow (Better Auth's verification). */
export interface VerificationsTable {
  readonly id: Generated<string>;
  identifier: string;
  value: string;
  expiresAt: Date;
  createdAt: TimestampWithDefault;
  updatedAt: TimestampWithDefault;
}

/** A personal access token (accessTokens.ts): only its SHA-256 is stored. */
export interface AccessTokensTable {
  readonly id: Generated<string>;
  userId: string;
  tokenName: string;
  tokenSha256: string;
  createdAt: TimestampWithDefault;
  expiresAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
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
  "arrowpush.accounts": AccountsTable;
  "arrowpush.verifications": VerificationsTable;
  "arrowpush.accessTokens": AccessTokensTable;
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
