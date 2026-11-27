/**
 * Tests for serverReactionStore.ts's own decisions: names and messages. The requests themselves
 * are tested against the real server in backendServer/editorThroughServer.test.ts.
 */
import { describe, expect, it } from "vitest";
import { publishOutcomeMessage, slugOfFileName } from "./serverReactionStore.js";

describe("names", () => {
  it("takes the slug from a file name", () => {
    expect(slugOfFileName("sn2-test.json")).toBe("sn2-test");
    expect(slugOfFileName("sn2-test")).toBe("sn2-test");
  });
});

describe("messages after Publish", () => {
  it("says which version was published, its warnings, and whether the site is rebuilding", () => {
    expect(
      publishOutcomeMessage({
        outcome: "published",
        reactionVersion: 2,
        lintWarningCount: 0,
        deployStart: "started",
      }),
    ).toEqual({ tone: "good", text: "Published version 2. The learner site is being rebuilt." });
    expect(
      publishOutcomeMessage({
        outcome: "published",
        reactionVersion: 1,
        lintWarningCount: 2,
        deployStart: "failed",
      }),
    ).toEqual({
      tone: "bad",
      text:
        "Published version 1 (2 lint warnings). The site rebuild could not be started: " +
        "the next Publish will include this version.",
    });
    expect(
      publishOutcomeMessage({
        outcome: "published",
        reactionVersion: 1,
        lintWarningCount: 1,
        deployStart: "not-configured",
      }).text,
    ).toBe("Published version 1 (1 lint warning). No site rebuild is set up on this server.");
  });

  it("gives the reason of a refusal, pointing to the Lint tab for lint errors", () => {
    expect(
      publishOutcomeMessage({ outcome: "refused", reason: "agree first", lintFindingCount: 0 }),
    ).toEqual({ tone: "bad", text: "Not published: agree first" });
    expect(
      publishOutcomeMessage({ outcome: "refused", reason: "lint errors", lintFindingCount: 3 }),
    ).toEqual({ tone: "bad", text: "Not published: lint errors (3 findings: see the Lint tab)" });
  });
});
