/**
 * Tests for commandLine.ts: the three commands of the module comment, and the usage on anything
 * else.
 */
import { describe, expect, it } from "vitest";
import { CommandLineError, parseBackendCommand } from "./commandLine.js";

describe("reading the command", () => {
  it("reads serve and migrate", () => {
    expect(parseBackendCommand(["serve"])).toEqual({ commandName: "serve" });
    expect(parseBackendCommand(["migrate"])).toEqual({ commandName: "migrate" });
  });

  it("reads import with published files and drafts, in either order", () => {
    expect(
      parseBackendCommand(["import", "--published", "a.json", "b.json", "--drafts", "c.json"]),
    ).toEqual({
      commandName: "import",
      publishedFilePaths: ["a.json", "b.json"],
      draftFilePaths: ["c.json"],
    });
    expect(parseBackendCommand(["import", "--drafts", "c.json", "--published", "a.json"])).toEqual({
      commandName: "import",
      publishedFilePaths: ["a.json"],
      draftFilePaths: ["c.json"],
    });
  });
});

describe("reading the access token commands", () => {
  it("reads create-token with its defaults or given name and lifetime, and revoke-token", () => {
    expect(parseBackendCommand(["create-token", "--user", "me@example.com"])).toEqual({
      commandName: "create-token",
      userEmail: "me@example.com",
      tokenName: "drafting",
      lifetimeDays: 90,
    });
    expect(
      parseBackendCommand([
        "create-token",
        "--days",
        "7",
        "--user",
        "me@example.com",
        "--name",
        "laptop",
      ]),
    ).toEqual({
      commandName: "create-token",
      userEmail: "me@example.com",
      tokenName: "laptop",
      lifetimeDays: 7,
    });
    expect(parseBackendCommand(["revoke-token", "some-id"])).toEqual({
      commandName: "revoke-token",
      accessTokenId: "some-id",
    });
  });
});

describe("refusing a command", () => {
  it("refuses no command, an unknown one, extra words, and import without files", () => {
    for (const commandArguments of [
      [],
      ["deploy"],
      ["serve", "now"],
      ["import"],
      ["import", "a.json"],
      ["import", "--published"],
      ["import", "--everything", "a.json"],
      ["create-token"],
      ["create-token", "--user"],
      ["create-token", "--user", "me@example.com", "--days", "soon"],
      ["create-token", "--user", "me@example.com", "--colour", "red"],
      ["revoke-token"],
      ["revoke-token", "a", "b"],
    ]) {
      expect(() => parseBackendCommand(commandArguments)).toThrow(CommandLineError);
    }
  });
});
