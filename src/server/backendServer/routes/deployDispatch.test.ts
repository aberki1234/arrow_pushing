/**
 * Tests for deployDispatch.ts: the request GitHub documents for repository_dispatch
 * (POST /repos/{owner}/{repo}/dispatches, 204 when accepted), and never a thrown error.
 */
import { describe, expect, it } from "vitest";
import { DEPLOY_EVENT_TYPE, startDeploy } from "./deployDispatch.js";

const DEPLOY = { repository: "owner/learner-site", dispatchToken: "dispatch-token" };

describe("starting the deploy workflow", () => {
  it("sends repository_dispatch with the token and answers started on 204", async () => {
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const deployStart = await startDeploy(DEPLOY, (url, init) => {
      requests.push({ url, init });
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    expect(deployStart).toBe("started");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://api.github.com/repos/owner/learner-site/dispatches");
    expect(requests[0]?.init?.method).toBe("POST");
    const headers = new Headers(requests[0]?.init?.headers);
    expect(headers.get("authorization")).toBe("Bearer dispatch-token");
    expect(headers.get("accept")).toBe("application/vnd.github+json");
    expect(JSON.parse(requests[0]?.init?.body as string)).toEqual({
      event_type: DEPLOY_EVENT_TYPE,
    });
  });

  it("answers not-configured without settings, sending nothing", async () => {
    const deployStart = await startDeploy(null, () => Promise.reject(new Error("must not run")));
    expect(deployStart).toBe("not-configured");
  });

  it("answers failed on a refusal or a network error, without throwing", async () => {
    expect(
      await startDeploy(DEPLOY, () => Promise.resolve(new Response("bad", { status: 401 }))),
    ).toBe("failed");
    expect(await startDeploy(DEPLOY, () => Promise.reject(new Error("offline")))).toBe("failed");
  });
});
