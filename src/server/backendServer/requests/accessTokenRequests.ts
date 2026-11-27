/**
 * What an access token may ask of the server (docs/SPEC.md §6, "Drafting with an assistant"):
 * read its user's reactions, save drafts and ask who it is. Everything else (publishing, starting
 * a next version, submitting, reviewing, managing users) needs a person signed in in a browser,
 * whatever the token's user may do there.
 *
 *   GET  /api/me
 *   GET  /api/reactions
 *   GET  /api/reactions/:slug
 *   GET  /api/reactions/:slug/versions/:version
 *   PUT  /api/reactions/:slug/draft
 */
const SEGMENT = "[^/]+";

const ROUTES_OPEN_TO_ACCESS_TOKENS: readonly (readonly [string, RegExp])[] = [
  ["GET", /^\/api\/me$/],
  ["GET", /^\/api\/reactions$/],
  ["GET", new RegExp(`^/api/reactions/${SEGMENT}$`)],
  ["GET", new RegExp(`^/api/reactions/${SEGMENT}/versions/${SEGMENT}$`)],
  ["PUT", new RegExp(`^/api/reactions/${SEGMENT}/draft$`)],
];

export const ACCESS_TOKEN_REFUSAL =
  "an access token may only read reactions and save drafts; sign in to Create for the rest";

export function accessTokenMayRequest(method: string, path: string): boolean {
  return ROUTES_OPEN_TO_ACCESS_TOKENS.some(
    ([routeMethod, routePath]) => routeMethod === method && routePath.test(path),
  );
}

/** The token of an `Authorization: Bearer <token>` header, if the request has one. */
export function bearerTokenOf(requestHeaders: Headers): string | undefined {
  const match = /^bearer\s+(\S+)\s*$/i.exec(requestHeaders.get("authorization") ?? "");
  return match?.[1];
}
