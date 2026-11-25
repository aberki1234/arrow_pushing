/**
 * Signing in with GitHub through Better Auth (docs/SPEC.md §5, backend, "Sign-in").
 *
 * Terms
 *   allow-list  ALLOWED_GITHUB_USER_IDS: the numeric GitHub user ids that may sign in.
 * Rules
 *   - GitHub is the only way to sign in (no email and password).
 *   - user.validateUserInfo refuses (403) every GitHub profile whose id is not on the allow-list,
 *     before a user is created and again at each sign-in; it fails closed if it throws.
 *   - Users are owners (site role "owner"): in 8c only the owner is on the allow-list. Contributors
 *     (8d) will change this.
 *   - Sessions last 30 days; the cookie (prefix "arrowpush") is httpOnly, SameSite=Lax, Secure
 *     on https, and signed with BETTER_AUTH_SECRET. GitHub tokens are stored encrypted. Telemetry
 *     stays off (Better Auth's default).
 *   - Tables: arrowpush.users, sessions, accounts, verifications (migration 0001); user ids are
 *     uuids, so reactions.owner_user_id can refer to them.
 * Routes: Better Auth's, under /api/auth (sign-in: POST /api/auth/sign-in/social with
 * {provider: "github"}; GitHub returns to /api/auth/callback/github; sign-out: POST
 * /api/auth/sign-out; the session: GET /api/auth/get-session).
 */
import { betterAuth } from "better-auth";
import type { MiddlewareHandler } from "hono";
import type { ReactionDatabase, SiteRole } from "../reactionDatabase/databaseTables.js";
import type { ServerEnvironment, SignedInUser } from "./serverDependencies.js";
import type { ServerSettings } from "./serverSettings.js";

export const SESSION_LIFETIME_DAYS = 30;

export const AUTHENTICATION_BASE_PATH = "/api/auth";

const SECONDS_PER_DAY = 24 * 60 * 60;

/** The site role of every user made at sign-in (8c: the owner is the only one allowed). */
const SITE_ROLE_OF_NEW_USERS: SiteRole = "owner";

const SITE_ROLES: readonly string[] = ["contributor", "reviewer", "owner"];

/** The Better Auth instance: its request handler and its server-side API. */
export type Authentication = Pick<ReturnType<typeof betterAuth>, "handler" | "api" | "options">;

/** Whether a raw GitHub profile (the /user answer) is on the allow-list, by its numeric id. */
export function isAllowedGithubProfile(
  githubProfile: Readonly<Record<string, unknown>> | undefined,
  allowedGithubUserIds: readonly string[],
): boolean {
  const githubUserId = githubProfile?.id;
  // GitHub sends the id as a JSON number; anything else is not a GitHub profile.
  if (typeof githubUserId !== "number" || !Number.isInteger(githubUserId)) {
    return false;
  }
  return allowedGithubUserIds.includes(String(githubUserId));
}

/** user.validateUserInfo's refusal, as Better Auth reports it to the browser. */
const NOT_ALLOWED_REFUSAL = {
  error: "account_not_allowed",
  errorDescription: "this GitHub account may not sign in to the editor",
};

/** Better Auth configured as in the module comment, on `database`. */
export function createAuthentication(
  database: ReactionDatabase,
  settings: ServerSettings,
): Authentication {
  const { signIn } = settings;
  return betterAuth({
    baseURL: settings.publicBaseUrl,
    basePath: AUTHENTICATION_BASE_PATH,
    secret: signIn.betterAuthSecret,
    database: { db: database, type: "postgres", schemaName: "arrowpush" },
    socialProviders: {
      github: { clientId: signIn.githubClientId, clientSecret: signIn.githubClientSecret },
    },
    user: {
      modelName: "users",
      additionalFields: {
        siteRole: {
          type: "string",
          required: true,
          input: false,
          defaultValue: SITE_ROLE_OF_NEW_USERS,
        },
      },
      validateUserInfo: ({ source }) => {
        try {
          const isAllowed =
            source.oauth?.providerId === "github" &&
            isAllowedGithubProfile(source.oauth.profile, signIn.allowedGithubUserIds);
          return isAllowed ? undefined : NOT_ALLOWED_REFUSAL;
        } catch {
          return NOT_ALLOWED_REFUSAL;
        }
      },
    },
    session: { modelName: "sessions", expiresIn: SESSION_LIFETIME_DAYS * SECONDS_PER_DAY },
    account: { modelName: "accounts", encryptOAuthTokens: true },
    verification: { modelName: "verifications" },
    advanced: { cookiePrefix: "arrowpush", database: { generateId: "uuid" } },
  });
}

function isSiteRole(value: unknown): value is SiteRole {
  return typeof value === "string" && SITE_ROLES.includes(value);
}

/** The user of the request's session, or undefined without a live session. */
export async function signedInUserFor(
  authentication: Authentication,
  requestHeaders: Headers,
): Promise<SignedInUser | undefined> {
  const sessionAndUser = await authentication.api.getSession({ headers: requestHeaders });
  if (sessionAndUser === null) {
    return undefined;
  }
  const { user } = sessionAndUser;
  const siteRole: unknown = (user as Record<string, unknown>).siteRole;
  if (!isSiteRole(siteRole)) {
    return undefined;
  }
  return { userId: user.id, displayName: user.name, siteRole };
}

/** Answer 401 unless the request carries a live session; otherwise set signedInUser. */
export function requireSignIn(
  authentication: Authentication,
): MiddlewareHandler<ServerEnvironment> {
  return async (context, next) => {
    const signedInUser = await signedInUserFor(authentication, context.req.raw.headers);
    if (signedInUser === undefined) {
      return context.json({ error: "sign in first" }, 401);
    }
    context.set("signedInUser", signedInUser);
    await next();
    return undefined;
  };
}
