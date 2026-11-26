/** Tests for commandLine.ts: the draft-sync commands and their settings from the environment. */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SERVER_URL,
  DraftSyncCommandError,
  parseDraftSyncCommand,
  reactionFilePaths,
  serverConnectionFrom,
} from "./commandLine.js";

describe("reading the command", () => {
  it("reads check and push-draft with files or folders, and pull-draft with slugs", () => {
    expect(parseDraftSyncCommand(["check", "a.json", "folder"])).toEqual({
      commandName: "check",
      paths: ["a.json", "folder"],
    });
    expect(parseDraftSyncCommand(["push-draft", "a.json"])).toEqual({
      commandName: "push-draft",
      paths: ["a.json"],
    });
    expect(parseDraftSyncCommand(["pull-draft", "nitration-of-benzene"])).toEqual({
      commandName: "pull-draft",
      reactionSlugs: ["nitration-of-benzene"],
      folderPath: "content/reactions",
    });
    expect(parseDraftSyncCommand(["pull-draft", "--folder", "elsewhere", "a", "b"])).toEqual({
      commandName: "pull-draft",
      reactionSlugs: ["a", "b"],
      folderPath: "elsewhere",
    });
  });

  it("refuses no command, an unknown one, and a command without paths or slugs", () => {
    for (const commandArguments of [
      [],
      ["publish", "a.json"],
      ["check"],
      ["push-draft"],
      ["pull-draft"],
      ["pull-draft", "--folder"],
    ]) {
      expect(() => parseDraftSyncCommand(commandArguments)).toThrow(DraftSyncCommandError);
    }
  });
});

describe("the files of a command", () => {
  it("expands a folder to its reaction files, leaving out the sync state", () => {
    const folderPath = mkdtempSync(join(tmpdir(), "draft-sync-paths-"));
    for (const fileName of ["b.json", "a.json", ".draft-sync.json", "notes.txt"]) {
      writeFileSync(join(folderPath, fileName), "{}");
    }
    mkdirSync(join(folderPath, "nested"));
    expect(reactionFilePaths([folderPath, "single.json"])).toEqual([
      join(folderPath, "a.json"),
      join(folderPath, "b.json"),
      "single.json",
    ]);
  });
});

describe("the server connection", () => {
  it("takes the token from ARROWPUSH_ACCESS_TOKEN and the server from ARROWPUSH_SERVER_URL", () => {
    expect(serverConnectionFrom({ ARROWPUSH_ACCESS_TOKEN: " ap_x " })).toEqual({
      serverUrl: DEFAULT_SERVER_URL,
      accessToken: "ap_x",
    });
    expect(
      serverConnectionFrom({
        ARROWPUSH_ACCESS_TOKEN: "ap_x",
        ARROWPUSH_SERVER_URL: "http://localhost:3000/",
      }),
    ).toEqual({ serverUrl: "http://localhost:3000", accessToken: "ap_x" });
    expect(() => serverConnectionFrom({})).toThrow(DraftSyncCommandError);
  });
});
