/**
 * Helpers for the server's tests: settings, a fake GitHub and a fake Google (standing in for the
 * global fetch, which Better Auth uses), and signing in through the real Better Auth routes.
 *
 * Signing in, as a browser would
 *   1. POST /api/auth/sign-in/social {provider: "github"}: Better Auth answers GitHub's authorize
 *      address (with a state value) and sets its state cookie.
 *   2. GET /api/auth/callback/github?code&state with that cookie: Better Auth asks the fake GitHub
 *      for a token, the profile and the emails, then answers a redirect and the session cookie.
 * Google is the same with provider "google": its token answer carries an id token (a JWT), which
 * Better Auth decodes for the profile in this flow; the fake's is unsigned.
 */
import type { Hono } from "hono";
import { vi } from "vitest";
import type { ServerSettings } from "../server/backendServer/serverSettings.js";

export const TEST_BASE_URL = "http://localhost:3000";

/** The allowed GitHub user id in test settings. */
export const OWNER_GITHUB_USER_ID = "1001";

export function testServerSettings(overrides: Partial<ServerSettings> = {}): ServerSettings {
  return {
    databaseUrl: "postgres://unused-in-tests",
    publicBaseUrl: TEST_BASE_URL,
    signIn: {
      betterAuthSecret: "test-secret-with-enough-characters-0123456789",
      githubClientId: "test-client-id",
      githubClientSecret: "test-client-secret",
      allowedGithubUserIds: [OWNER_GITHUB_USER_ID],
      google: { clientId: "test-google-client-id", clientSecret: "test-google-client-secret" },
    },
    deploy: { repository: "owner/learner-site", dispatchToken: "test-dispatch-token" },
    editorFilesFolder: "build/editor-not-built-in-tests",
    port: 3000,
    ...overrides,
  };
}

/** The parts of GitHub's /user answer the tests vary. */
export interface FakeGithubProfile {
  readonly id: number;
  readonly login: string;
  readonly name: string | null;
  readonly email: string;
}

export const OWNER_PROFILE: FakeGithubProfile = {
  id: Number(OWNER_GITHUB_USER_ID),
  login: "owner-login",
  name: "Owner Name",
  email: "owner@example.com",
};

export const FAKE_GITHUB_ACCESS_TOKEN = "gho_fake_access_token";

function jsonAnswer(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Answers GitHub's token, /user and /user/emails requests for `profile`; anything else 404. */
function fakeGithubAnswer(profile: FakeGithubProfile, url: string): Response {
  if (url.startsWith("https://github.com/login/oauth/access_token")) {
    return jsonAnswer({
      access_token: FAKE_GITHUB_ACCESS_TOKEN,
      token_type: "bearer",
      scope: "read:user,user:email",
    });
  }
  if (url.startsWith("https://api.github.com/user/emails")) {
    return jsonAnswer([{ email: profile.email, primary: true, verified: true, visibility: null }]);
  }
  if (url.startsWith("https://api.github.com/user")) {
    return jsonAnswer({ ...profile, avatar_url: null });
  }
  return new Response("not faked", { status: 404 });
}

/** Replace the global fetch with the fake GitHub for `profile` (undo with vi.unstubAllGlobals). */
export function useFakeGithub(profile: FakeGithubProfile): void {
  vi.stubGlobal("fetch", (input: string | URL | Request): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    return Promise.resolve(fakeGithubAnswer(profile, url));
  });
}

/** "name=value" of each Set-Cookie header, joined for a Cookie header. */
export function cookieHeaderFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((setCookie) => setCookie.split(";")[0] ?? "")
    .filter((nameAndValue) => !nameAndValue.endsWith("="))
    .join("; ");
}

export interface SignInOutcome {
  /** The callback's answer: a redirect, to "/" or to an error page. */
  readonly callbackResponse: Response;
  /** The Cookie header to send afterwards; empty when no session was started. */
  readonly sessionCookieHeader: string;
}

type TestApplication<Environment extends object> = Hono<Environment & { Variables: object }>;

/** Steps 1 and 2 of the module comment, with the fake provider already in place. */
async function signInThrough<Environment extends object>(
  application: TestApplication<Environment>,
  provider: "github" | "google",
): Promise<SignInOutcome> {
  const startResponse = await application.request(`${TEST_BASE_URL}/api/auth/sign-in/social`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: TEST_BASE_URL },
    body: JSON.stringify({ provider, callbackURL: "/" }),
  });
  const { url: authorizeUrl } = (await startResponse.json()) as { url: string };
  const signInState = new URL(authorizeUrl).searchParams.get("state") ?? "";
  const callbackResponse = await application.request(
    `${TEST_BASE_URL}/api/auth/callback/${provider}?code=fake-code&state=${signInState}`,
    { headers: { cookie: cookieHeaderFrom(startResponse) } },
  );
  return { callbackResponse, sessionCookieHeader: cookieHeaderFrom(callbackResponse) };
}

/** Sign in through Better Auth's routes with the fake GitHub answering for `profile`. */
export function signInWithFakeGithub<Environment extends object>(
  application: TestApplication<Environment>,
  profile: FakeGithubProfile,
): Promise<SignInOutcome> {
  useFakeGithub(profile);
  return signInThrough(application, "github");
}

/** The claims of Google's id token the tests vary. */
export interface FakeGoogleProfile {
  readonly sub: string;
  readonly name: string;
  readonly email: string;
  readonly emailVerified: boolean;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** Answers Google's token request with an id token for `profile`; anything else 404. */
function fakeGoogleAnswer(profile: FakeGoogleProfile, url: string): Response {
  if (!url.startsWith("https://oauth2.googleapis.com/token")) {
    return new Response("not faked", { status: 404 });
  }
  const claims = {
    iss: "https://accounts.google.com",
    aud: "test-google-client-id",
    sub: profile.sub,
    name: profile.name,
    email: profile.email,
    email_verified: profile.emailVerified,
    picture: null,
  };
  return jsonAnswer({
    access_token: "ya29.fake_access_token",
    token_type: "Bearer",
    expires_in: 3599,
    scope: "openid email profile",
    id_token: `${base64UrlJson({ alg: "RS256", typ: "JWT" })}.${base64UrlJson(claims)}.unsigned`,
  });
}

/** Sign in through Better Auth's routes with the fake Google answering for `profile`. */
export function signInWithFakeGoogle<Environment extends object>(
  application: TestApplication<Environment>,
  profile: FakeGoogleProfile,
): Promise<SignInOutcome> {
  vi.stubGlobal("fetch", (input: string | URL | Request): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    return Promise.resolve(fakeGoogleAnswer(profile, url));
  });
  return signInThrough(application, "google");
}
