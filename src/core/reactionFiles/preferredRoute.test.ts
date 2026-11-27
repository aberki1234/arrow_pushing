/**
 * Tests for preferredRoute.ts on the four example reactions (fixtures/reactions). The expected
 * ends were read by hand from each file's steps: following the preferred step out of each state
 * from the start state. The Wittig's accepted betaine route is never followed.
 */
import { expect, it } from "vitest";
import { exampleReactionDocuments } from "../../testSupport/fixtureFiles.js";
import { endOfPreferredRoute } from "./preferredRoute.js";

it.each([
  ["aldol-addition-base.json", "aldol-product"],
  ["sn2-hydroxide-bromomethane.json", "products"],
  ["radical-bromination-methane.json", "products"],
  ["wittig-methylenation-cyclohexanone.json", "products"],
])("the preferred route of %s ends at %s", (fileName, expectedStateId) => {
  const document = exampleReactionDocuments().find(([name]) => name === fileName)?.[1];
  expect(document && endOfPreferredRoute(document)).toBe(expectedStateId);
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
