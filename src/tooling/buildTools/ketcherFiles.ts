/**
 * Ketcher, Create's structure editor (docs/schema-design.md §10, item 10h), is EPAM's prebuilt
 * standalone release (Apache-2.0). It is not kept in git: the build fetches the pinned release,
 * checks its SHA-256, and unpacks it into the editor's public folder, so Create's server serves it
 * at /ketcher/ (same origin, so Create can call its API).
 */
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { unzipSync } from "fflate";

export const KETCHER_RELEASE = {
  version: "3.21.0",
  zipUrl: "https://github.com/epam/ketcher/releases/download/v3.21.0/ketcher-standalone-3.21.0.zip",
  sha256: "215f5ac6cd280342df3ba3a4f8347e9b72c40ec5cc1e1e9fc2751de5b3e5c73c",
} as const;

/** Where `make editor` and the editor build find it (Vite's public folder for the editor). */
export const KETCHER_FOLDER = "vendor/editor-public/ketcher";

/**
 * Unpack the release into `folder` (replacing what is there) if its SHA-256 is `expectedSha256`,
 * and write a VERSION marker. Throws, writing nothing, on a checksum mismatch.
 */
export function unpackKetcherRelease(
  zipBytes: Uint8Array,
  expectedSha256: string,
  version: string,
  folder: string,
): void {
  const actualSha256 = createHash("sha256").update(zipBytes).digest("hex");
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `Ketcher download checksum ${actualSha256} is not the pinned ${expectedSha256}; not unpacked`,
    );
  }
  const files = unzipSync(zipBytes);
  rmSync(folder, { recursive: true, force: true });
  for (const [path, bytes] of Object.entries(files)) {
    if (path.endsWith("/") || path.split("/").includes("..")) {
      continue;
    }
    const target = join(folder, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  writeFileSync(join(folder, "VERSION"), version);
}
