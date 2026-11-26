/**
 * Signing in with GitHub or Google through Better Auth (docs/SPEC.md §5, backend, "Sign-in", and
 * §6, "Contributors").
 *
 * Terms
 *   allow-list  ALLOWED_GITHUB_USER_IDS: the numeric GitHub user ids of the owner.
 * Rules
 *   - GitHub, and Google when its settings are given (no email and password).
 *   - Anyone may sign in: a new user is a contributor. A GitHub account on the allow-list makes
 *     its user the owner when the account is created or linked (an "after create" hook, which
 *     Better Auth runs once the user and account are committed).
 *   - One person's GitHub and Google accounts are one user when both providers verified the same
 *     email (Better Auth's account linking, with no provider trusted without verification).
 *   - A blocked user still signs in (sitePermissions.ts stops them saving).
 *   - Rate limiting (Better Auth's) counts by the client's address: CLIENT_ADDRESS_HEADERS.
 *   - Sessions last 30 days; the cookie (prefix "arrowpush") is httpOnly, SameSite=Lax, Secure
 *     on https, and signed with BETTER_AUTH_SECRET. Provider tokens are stored encrypted.
 *     Telemetry stays off (Better Auth's default).
 *   - Tables: arrowpush.users, sessions, accounts, verifications (migration 0001); user ids are
 *     uuids, so reactions.owner_user_id can refer to them.
 * Routes: Better Auth's, under /api/auth (sign-in: POST /api/auth/sign-in/social with
 * {provider: "github" | "google"}; the provider returns to /api/auth/callback/<provider>;
 * sign-out: POST /api/auth/sign-out; the session: GET /api/auth/get-session).
 */
import { betterAuth } from "better-auth";
import type { MiddlewareHandler } from "hono";
import type { ReactionDatabase, SiteRole } from "../reactionDatabase/databaseTables.js";
import type { ServerEnvironment, SignedInUser } from "./serverDependencies.js";
import type { ServerSettings } from "./serverSettings.js";

export const SESSION_LIFETIME_DAYS = 30;

export const AUTHENTICATION_BASE_PATH = "/api/auth";

const SECONDS_PER_DAY = 24 * 60 * 60;

/**
 * Where Better Auth's rate limiting finds the client's address. Render's edge is Cloudflare, which
 * sets CF-Connecting-IP to the visitor's address (replacing any the visitor sent); X-Forwarded-For
 * there is a chain of proxies, which Better Auth trusts only when it holds one address.
 */
const CLIENT_ADDRESS_HEADERS = ["cf-connecting-ip", "x-forwarded-for"];

/** The site role of every user made at sign-in. */
const SITE_ROLE_OF_NEW_USERS: SiteRole = "contributor";

const SITE_ROLES: readonly string[] = ["contributor", "reviewer", "owner", "blocked"];

export type SignInProvider = "github" | "google";

/** The Better Auth instance: its request handler and its server-side API. */
export type Authentication = Pick<ReturnType<typeof betterAuth>, "handler" | "api" | "options">;

/** The sign-in providers the settings set up, in the order the sign-in page shows them. */
export function signInProviders(settings: ServerSettings): SignInProvider[] {
  return settings.signIn.google === null ? ["github"] : ["github", "google"];
}

/** Make the account's user the owner if it is an allow-listed GitHub account. */
async function promoteAllowListedOwner(
  database: ReactionDatabase,
  allowedGithubUserIds: readonly string[],
  account: { readonly providerId: string; readonly accountId: string; readonly userId: string },
): Promise<void> {
  if (account.providerId !== "github" || !allowedGithubUserIds.includes(account.accountId)) {
    return;
  }
  await database
    .updateTable("arrowpush.users")
    .set({ siteRole: "owner", updatedAt: new Date() })
    .where("id", "=", account.userId)
    .execute();
}

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
      ...(signIn.google === null ? {} : { google: { ...signIn.google, prompt: "select_account" } }),
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
    },
    databaseHooks: {
      account: {
        create: {
          after: (account) =>
            promoteAllowListedOwner(database, signIn.allowedGithubUserIds, account),
        },
      },
    },
    session: { modelName: "sessions", expiresIn: SESSION_LIFETIME_DAYS * SECONDS_PER_DAY },
    account: {
      modelName: "accounts",
      encryptOAuthTokens: true,
      accountLinking: { enabled: true, trustedProviders: [] },
    },
    verification: { modelName: "verifications" },
    advanced: {
      cookiePrefix: "arrowpush",
      database: { generateId: "uuid" },
      ipAddress: { ipAddressHeaders: CLIENT_ADDRESS_HEADERS },
    },
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
