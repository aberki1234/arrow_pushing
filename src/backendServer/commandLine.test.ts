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

  it("refuses no command, an unknown one, extra words, and import without files", () => {
    for (const commandArguments of [
      [],
      ["deploy"],
      ["serve", "now"],
      ["import"],
      ["import", "a.json"],
      ["import", "--published"],
      ["import", "--everything", "a.json"],
    ]) {
      expect(() => parseBackendCommand(commandArguments)).toThrow(CommandLineError);
    }
  });
});
