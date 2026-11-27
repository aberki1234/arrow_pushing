/**
 * Tests for reactionFileReading.ts: a reaction document read, after its schema check, as a
 * typed reaction file or, for an unfinished draft, as a typed mechanism.
 */
import { describe, expect, test } from "vitest";
import {
  exampleReactionDocuments,
  performanceReactionDocuments,
} from "../../testSupport/fixtureFiles.js";
import { readReactionFile, readReactionMechanism } from "./reactionFileReading.js";

function sn2Document(): Record<string, unknown> {
  const found = exampleReactionDocuments().find(
    ([name]) => name === "sn2-hydroxide-bromomethane.json",
  );
  if (found === undefined) throw new Error("no SN2 example");
  return structuredClone(found[1]);
}

describe("a reaction file", () => {
  test.each([...exampleReactionDocuments(), ...performanceReactionDocuments()])(
    "%s reads as a typed reaction file",
    (name, document) => {
      expect(name).toMatch(/\.json$/);
      const read = readReactionFile(document);
      expect(read).toMatchObject({ reactionFile: { reactionSlug: document["reactionSlug"] } });
    },
  );

  test("missing a Publish field is refused with its schema violations", () => {
    const document = sn2Document();
    delete document["title"];
    expect(readReactionFile(document)).toEqual({
      schemaViolations: [
        { instancePath: "", message: "required: must have required property 'title'" },
      ],
    });
  });
});

describe("a mechanism", () => {
  test("is read from a draft whose Publish fields are not filled in yet", () => {
    const document = { ...sn2Document(), title: "", authors: [], mechanismSummary: "" };
    expect(readReactionFile(document)).toHaveProperty("schemaViolations");
    const read = readReactionMechanism(document);
    expect(read).toMatchObject({ reactionMechanism: { startStateId: "reactants" } });
  });

  test("is read from a new draft with one state and no steps", () => {
    const document = sn2Document();
    const states = document["stateIdToState"] as Record<string, unknown>;
    const draft = {
      startStateId: "reactants",
      stateIdToState: { reactants: states["reactants"] },
      steps: [],
    };
    expect(readReactionMechanism(draft)).toMatchObject({
      reactionMechanism: { steps: [] },
    });
  });

  test("with a broken step is refused, pointing at the step", () => {
    const document = sn2Document();
    const steps = document["steps"] as Record<string, unknown>[];
    steps[0] = { ...steps[0], routePreference: "maybe" };
    const read = readReactionMechanism(document);
    expect(read).toHaveProperty("schemaViolations");
    if (!("schemaViolations" in read)) return;
    expect(read.schemaViolations.map((violation) => violation.instancePath)).toContain(
      "/steps/0/routePreference",
    );
  });
});
