/** Tests for staticFileNaming.ts: canonical bytes, content hashes, refs and file paths. */
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { CatalogueBuildError } from "./catalogueBuildErrors.js";
import {
  canonicalJsonBytes,
  contentHashOf,
  parseReactionVersionRef,
  reactionFilePath,
} from "./staticFileNaming.js";
import { reactionVersionRef } from "../../../core/catalogue/reactionVersionRefs.js";

const asText = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

it("canonical JSON sorts keys at every depth, drops white space and keeps non-ASCII", () => {
  const document = { title: "Br• adds", a: [1, { z: null, b: true }] };
  expect(asText(canonicalJsonBytes(document))).toBe(
    '{"a":[1,{"b":true,"z":null}],"title":"Br• adds"}',
  );
});

it("canonical JSON writes numbers as JavaScript does (1.0 is 1)", () => {
  expect(asText(canonicalJsonBytes({ coordinates: [1.0, -0.5, 2.25] }))).toBe(
    '{"coordinates":[1,-0.5,2.25]}',
  );
});

it("key order does not change the content hash", () => {
  expect(contentHashOf({ a: 1, b: 2 })).toBe(contentHashOf({ b: 2, a: 1 }));
});

it("the content hash is the sha256 hex digest of the canonical bytes", () => {
  const expectedHash = createHash("sha256")
    .update('{"reactionSlug":"sn2","reactionVersion":1}')
    .digest("hex");
  expect(contentHashOf({ reactionSlug: "sn2", reactionVersion: 1 })).toBe(expectedHash);
  expect(expectedHash).toHaveLength(64);
});

it("a reaction version ref round-trips through the strict reader", () => {
  expect(reactionVersionRef("aldol-addition-base", 3)).toBe("aldol-addition-base@3");
  expect(parseReactionVersionRef("aldol-addition-base@3")).toEqual(["aldol-addition-base", 3]);
});

it.each(["aldol", "aldol@", "aldol@0", "aldol@x", "Aldol@1", "@1"])(
  "a malformed ref %j is refused",
  (badRef) => {
    expect(() => parseReactionVersionRef(badRef)).toThrow(/not a reaction version ref/);
  },
);

it("the reaction file path uses the first eight hash characters", () => {
  expect(reactionFilePath("sn2", 2, "0123456789abcdef".repeat(4))).toBe("r/sn2/2.01234567.json");
});

it("build errors carry their code", () => {
  const error = new CatalogueBuildError("content-hash-changed", "sn2@1 changed");
  expect(error.errorCode).toBe("content-hash-changed");
  expect(error.message).toBe("sn2@1 changed");
});
