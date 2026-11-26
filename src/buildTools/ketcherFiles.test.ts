/** Tests for ketcherFiles.ts: unpacking the pinned Ketcher release only if its checksum matches. */
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { KETCHER_RELEASE, unpackKetcherRelease } from "./ketcherFiles.js";

const zipBytes = zipSync({
  "index.html": strToU8("<html>ketcher</html>"),
  "static/js/main.js": strToU8("console.log(1);"),
});
const sha256 = createHash("sha256").update(zipBytes).digest("hex");

describe("the pinned release", () => {
  it("names a version, an https address and a SHA-256", () => {
    expect(KETCHER_RELEASE.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(KETCHER_RELEASE.zipUrl).toMatch(/^https:\/\/github\.com\/epam\/ketcher\/releases\//);
    expect(KETCHER_RELEASE.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("unpacking", () => {
  it("writes every file of a release whose checksum matches, and a version marker", () => {
    const folder = mkdtempSync(join(tmpdir(), "ketcher-"));
    unpackKetcherRelease(zipBytes, sha256, "9.9.9", folder);
    expect(readFileSync(join(folder, "index.html"), "utf-8")).toBe("<html>ketcher</html>");
    expect(existsSync(join(folder, "static/js/main.js"))).toBe(true);
    expect(readFileSync(join(folder, "VERSION"), "utf-8")).toBe("9.9.9");
  });

  it("refuses a download whose checksum does not match, writing nothing", () => {
    const folder = join(mkdtempSync(join(tmpdir(), "ketcher-")), "target");
    expect(() => {
      unpackKetcherRelease(zipBytes, "0".repeat(64), "9.9.9", folder);
    }).toThrow(/checksum/);
    expect(existsSync(folder)).toBe(false);
  });
});
