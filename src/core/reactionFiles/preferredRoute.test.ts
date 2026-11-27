/**
 * Tests for preferredRoute.ts on the four example reactions (fixtures/reactions). The expected
 * ends were read by hand from each file's steps: following the preferred step out of each state
 * from the start state. The Wittig's accepted betaine route is never followed.
 */
import { describe, expect, it } from "vitest";
import { exampleReactionDocuments } from "../../testSupport/fixtureFiles.js";
import {
  type RouteStep,
  endOfPreferredRoute,
  preferredRoute,
  routeOfDocument,
} from "./preferredRoute.js";

it.each([
  ["aldol-addition-base.json", "aldol-product"],
  ["sn2-hydroxide-bromomethane.json", "products"],
  ["radical-bromination-methane.json", "products"],
  ["wittig-methylenation-cyclohexanone.json", "products"],
])("the preferred route of %s ends at %s", (fileName, expectedStateId) => {
  const document = exampleReactionDocuments().find(([name]) => name === fileName)?.[1];
  expect(document && endOfPreferredRoute(routeOfDocument(document))).toBe(expectedStateId);
});

it("a reaction with no steps ends where it starts", () => {
  expect(endOfPreferredRoute({ startStateId: "reactants", steps: [] })).toBe("reactants");
});

it("a preferred step back to a state already passed ends the route", () => {
  const steps = [
    { fromStateId: "a", toStateId: "b", routePreference: "preferred" },
    { fromStateId: "b", toStateId: "a", routePreference: "preferred" },
  ];
  expect(endOfPreferredRoute({ startStateId: "a", steps })).toBe("b");
});

interface KeyedStep extends RouteStep {
  readonly stepKey: string;
}

describe("the preferred route", () => {
  const step = (
    fromStateId: string,
    toStateId: string,
    routePreference = "preferred",
  ): KeyedStep => ({
    stepKey: `${fromStateId}-${toStateId}`,
    fromStateId,
    toStateId,
    routePreference,
  });
  const keysOf = (steps: readonly { stepKey: string }[]): string[] =>
    steps.map((each) => each.stepKey);

  it("follows the first preferred step out of each state, in file order", () => {
    const steps = [step("a", "b"), step("b", "x", "accepted"), step("b", "c"), step("b", "d")];
    expect(keysOf(preferredRoute({ startStateId: "a", steps }))).toEqual(["a-b", "b-c"]);
  });

  it("stops where no preferred step leaves, and is empty when none leaves the start", () => {
    const steps = [step("a", "b", "accepted")];
    expect(preferredRoute({ startStateId: "a", steps })).toEqual([]);
  });

  it("stops before a step back to a state already on the route", () => {
    const steps = [step("a", "b"), step("b", "c"), step("c", "a")];
    expect(keysOf(preferredRoute({ startStateId: "a", steps }))).toEqual(["a-b", "b-c"]);
  });
});
