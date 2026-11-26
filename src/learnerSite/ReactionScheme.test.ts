// @vitest-environment jsdom
/**
 * Component tests for ReactionScheme.svelte (item 11): the species of a state with "+" between
 * them (none before a counter-ion), the conditions above and below the arrow with real
 * subscripts, and the "?" box or the product after the arrow. The drawing itself is tested in
 * src/moleculeDrawing/schemeDrawing.test.ts.
 */
import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import ReactionScheme from "./ReactionScheme.svelte";

const SN2_START = {
  mappedSmiles: "[OH-:1].[CH3:2][Br:3].[Na+:4]",
  mapNumberToCoordinates: { "1": [-3.3, 0], "2": [0, 0], "3": [1.5, 0], "4": [-3.3, -1.9] },
};
const SN2_PRODUCT = {
  mappedSmiles: "[OH:1][CH3:2].[Br-:3].[Na+:4]",
  mapNumberToCoordinates: { "1": [-1.5, 0], "2": [0, 0], "3": [2.5, 0], "4": [2.5, -1.9] },
};

test("the start state's species are drawn with + between them, counter-ions left out", () => {
  const { container } = render(ReactionScheme, {
    props: { startState: SN2_START, conditionsLabel: "EtOH/H₂O · 25 °C", productState: null },
  });
  // Hydroxide and bromomethane (Na⁺ is in the conditions): two drawings and one "+".
  expect(container.querySelectorAll("svg.scheme-species")).toHaveLength(2);
  expect(container.querySelectorAll(".scheme-plus")).toHaveLength(1);
});

test("the conditions are written above and below the arrow with real subscripts", () => {
  const { container } = render(ReactionScheme, {
    props: {
      startState: SN2_START,
      conditionsLabel: "NaOH · EtOH/H₂O · 25 °C",
      productState: null,
    },
  });
  expect(container.querySelector(".scheme-above")?.textContent).toBe("NaOH");
  const below = container.querySelector(".scheme-below");
  expect(below?.textContent).toBe("EtOH/H2O, 25 °C");
  expect(below?.querySelector("sub")?.textContent).toBe("2");
});

test("without a product the arrow ends at a ? box", () => {
  render(ReactionScheme, { props: { startState: SN2_START, productState: null } });
  expect(screen.getByLabelText("Product hidden").textContent.trim()).toBe("?");
});

test("with a product the arrow ends at its drawing", () => {
  const { container } = render(ReactionScheme, {
    props: { startState: SN2_START, productState: SN2_PRODUCT },
  });
  expect(screen.queryByLabelText("Product hidden")).toBeNull();
  // Two start species and two product species (methanol and Br⁻; Na⁺ left out).
  expect(container.querySelectorAll("svg.scheme-species")).toHaveLength(4);
});

test("a label's subscript is a smaller tspan shifted down", () => {
  const { container } = render(ReactionScheme, {
    props: {
      startState: {
        mappedSmiles: "[CH3:1][Br:2]",
        mapNumberToCoordinates: { "1": [0, 0], "2": [1.5, 0] },
      },
      productState: null,
    },
  });
  const subscript = [...container.querySelectorAll("tspan")].find(
    (tspan) => tspan.textContent === "3",
  );
  expect(subscript?.getAttribute("font-size")).toBe("70%");
  expect(Number.parseFloat(subscript?.getAttribute("dy") ?? "0")).toBeGreaterThan(0);
});

test("a state the drawing cannot read leaves the picture out instead of failing", () => {
  const { container } = render(ReactionScheme, {
    props: {
      startState: { mappedSmiles: "not smiles", mapNumberToCoordinates: {} },
      conditionsLabel: "heat",
      productState: null,
    },
  });
  expect(container.querySelectorAll("svg.scheme-species")).toHaveLength(0);
  expect(container.querySelector(".scheme-above")?.textContent).toBe("heat");
});
