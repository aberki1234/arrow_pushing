/** Tests for accessTokenRequests.ts: what an access token may ask of the server. */
import { describe, expect, it } from "vitest";
import { accessTokenMayRequest, bearerTokenOf } from "./accessTokenRequests.js";

describe("the routes an access token may use", () => {
  it("allows reading the user's reactions, saving a draft and asking who it is", () => {
    for (const [method, path] of [
      ["GET", "/api/me"],
      ["GET", "/api/reactions"],
      ["GET", "/api/reactions/nitration-of-benzene"],
      ["GET", "/api/reactions/nitration-of-benzene/versions/2"],
      ["PUT", "/api/reactions/nitration-of-benzene/draft"],
    ] as const) {
      expect(accessTokenMayRequest(method, path), `${method} ${path}`).toBe(true);
    }
  });

  it("refuses everything else, whatever the user's role", () => {
    for (const [method, path] of [
      ["POST", "/api/reactions/nitration-of-benzene/publish"],
      ["POST", "/api/reactions/nitration-of-benzene/next-version"],
      ["POST", "/api/reactions/nitration-of-benzene/submit"],
      ["POST", "/api/reactions/nitration-of-benzene/review"],
      ["GET", "/api/reactions/nitration-of-benzene/review"],
      ["GET", "/api/review-queue"],
      ["GET", "/api/users"],
      ["PUT", "/api/users/some-id/role"],
      ["DELETE", "/api/reactions/nitration-of-benzene/draft"],
      ["PUT", "/api/reactions/nitration-of-benzene/draft/extra"],
      ["POST", "/api/auth/sign-out"],
    ] as const) {
      expect(accessTokenMayRequest(method, path), `${method} ${path}`).toBe(false);
    }
  });
});

describe("reading the bearer token", () => {
  it("reads `Authorization: Bearer <token>` and nothing else", () => {
    expect(bearerTokenOf(new Headers({ authorization: "Bearer ap_abc" }))).toBe("ap_abc");
    expect(bearerTokenOf(new Headers({ authorization: "bearer  ap_abc " }))).toBe("ap_abc");
    expect(bearerTokenOf(new Headers({ authorization: "Basic xyz" }))).toBeUndefined();
    expect(bearerTokenOf(new Headers({ authorization: "Bearer " }))).toBeUndefined();
    expect(bearerTokenOf(new Headers())).toBeUndefined();
  });
});
