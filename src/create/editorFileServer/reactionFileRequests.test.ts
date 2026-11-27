/**
 * Tests for reactionFileRequests.ts: the editor's development server lists, reads and saves
 * reaction files in one folder, and nothing else.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { newTemporaryFolder } from "../../testSupport/reactionCopies.js";
import { handleReactionFileRequest } from "./reactionFileRequests.js";

let folder: string;

beforeEach(() => {
  folder = join(newTemporaryFolder("reaction-files"), "content", "reactions");
});

function request(method: string, path: string, body = ""): { status: number; body: unknown } {
  const response = handleReactionFileRequest({ method, path, body }, folder);
  expect(response.contentType).toBe("application/json");
  return { status: response.status, body: JSON.parse(response.body) as unknown };
}

const draft = { reactionSlug: "sn2-test", title: "SN2 test", steps: [] };

describe("listing", () => {
  it("lists nothing when the folder does not exist yet", () => {
    expect(request("GET", "/")).toEqual({ status: 200, body: [] });
  });

  it("lists every .json file by name with its slug, title and progress in Create", () => {
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      join(folder, "b-reaction.json"),
      JSON.stringify({ reactionSlug: "b-reaction", title: "B" }),
    );
    writeFileSync(
      join(folder, "a-reaction.json"),
      JSON.stringify({ reactionSlug: "a-reaction", title: "A" }),
    );
    writeFileSync(join(folder, "notes.txt"), "not a reaction");
    writeFileSync(join(folder, "broken.json"), "{ not json");
    expect(request("GET", "").body).toEqual([
      {
        fileName: "a-reaction.json",
        reactionSlug: "a-reaction",
        title: "A",
        creationProgress: {
          arrowStepCount: 0,
          teachingDoneCount: 0,
          teachingItemCount: 1,
          neededLeftCount: 1,
        },
      },
      {
        fileName: "b-reaction.json",
        reactionSlug: "b-reaction",
        title: "B",
        creationProgress: {
          arrowStepCount: 0,
          teachingDoneCount: 0,
          teachingItemCount: 1,
          neededLeftCount: 1,
        },
      },
      { fileName: "broken.json", reactionSlug: null, title: null, creationProgress: null },
    ]);
  });
});

describe("saving and reading", () => {
  it("saves 2-space JSON, creating the folder, and reads it back", () => {
    expect(request("PUT", "/sn2-test.json", JSON.stringify(draft))).toEqual({
      status: 200,
      body: { savedFileName: "sn2-test.json" },
    });
    expect(readFileSync(join(folder, "sn2-test.json"), "utf-8")).toBe(
      `${JSON.stringify(draft, null, 2)}\n`,
    );
    expect(request("GET", "/sn2-test.json")).toEqual({ status: 200, body: draft });
  });

  it("answers 404 for a file that is not there", () => {
    expect(request("GET", "/missing.json").status).toBe(404);
  });

  it.each(["/../escape.json", "/Upper.json", "/sub/dir.json", "/no-extension", "/.json"])(
    "refuses the file name in %s",
    (path) => {
      expect(request("PUT", path, JSON.stringify(draft)).status).toBe(400);
      expect(request("GET", path).status).toBe(400);
      expect(existsSync(join(folder, "..", "escape.json"))).toBe(false);
    },
  );

  it.each(["{ not json", "[1, 2]", '"text"'])(
    "refuses to save %s, which is no JSON object",
    (body) => {
      expect(request("PUT", "/sn2-test.json", body).status).toBe(400);
    },
  );

  it("refuses other methods", () => {
    expect(request("DELETE", "/sn2-test.json").status).toBe(405);
    expect(request("POST", "/").status).toBe(405);
  });
});
