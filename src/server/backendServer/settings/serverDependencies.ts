/**
 * What the server is given: the database, the settings, the linter and fetch (for the deploy
 * request), so that tests can pass PGlite, a fake GitHub and the linter with RDKit.js loaded.
 */
import type { ReactionDatabase, SiteRole } from "../../reactionDatabase/model/databaseTables.js";
import type { LintFinding } from "../../../tooling/reactionLinting/findings/lintFindings.js";
import type { ServerSettings } from "./serverSettings.js";

/** The full linter (reactionLinting/rules/reactionLint.lintReaction with RDKit.js loaded). */
export type LintDocument = (reactionDocument: Readonly<Record<string, unknown>>) => LintFinding[];

/** The global fetch, or a fake in tests. */
export type FetchFunction = (url: string, init?: RequestInit) => Promise<Response>;

export interface ServerDependencies {
  readonly database: ReactionDatabase;
  readonly settings: ServerSettings;
  readonly lintDocument: LintDocument;
  /** Used for the deploy request; Better Auth's own calls to GitHub use the global fetch. */
  readonly fetchFunction: FetchFunction;
}

/** The user a request's session belongs to. */
export interface SignedInUser {
  readonly userId: string;
  /** The user's name (GitHub's profile name, or the login). */
  readonly displayName: string;
  readonly siteRole: SiteRole;
}

/** Hono's per-request variables: the signed-in user, set by requireSignIn(). */
export interface ServerEnvironment {
  Variables: { signedInUser: SignedInUser };
}
