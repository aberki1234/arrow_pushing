/** Tests for draftCreation.ts: the start panel's "New reaction". */
import { beforeAll, describe, expect, it } from "vitest";
import {
  type ChemistryToolkit,
  loadChemistryToolkit,
} from "../../tooling/chemistryToolkit/chemistryToolkit.js";
import { createdDraft, previewOfPastedSmiles } from "./draftCreation.js";

let toolkit: ChemistryToolkit;

beforeAll(async () => {
  toolkit = await loadChemistryToolkit();
});

it("makes a draft from a name, pasted SMILES, conditions and its author", () => {
  const creation = createdDraft(
    {
      title: " SN2 on bromoethane ",
      pastedSmiles: "[OH-].CCBr",
      conditionsLabel: " NaOH, EtOH ",
      authorName: "Owner Name",
    },
    ["sn2-on-bromoethane"],
    toolkit,
  );
  expect(creation.outcome).toBe("created");
  if (creation.outcome === "created") {
    expect(creation.document.reactionSlug).toBe("sn2-on-bromoethane-2");
    expect(creation.document.title).toBe("SN2 on bromoethane");
    expect(creation.document.conditionsLabel).toBe("NaOH, EtOH");
    expect(creation.document.authors).toEqual([{ name: "Owner Name", url: null }]);
    expect(
      (creation.document.stateIdToState as Record<string, { mappedSmiles: string }>)["state-1"]
        ?.mappedSmiles,
    ).toBe("[OH-:1].[CH3:2][CH2:3][Br:4]");
  }
});

it("leaves the authors empty without a signed-in name", () => {
  const creation = createdDraft(
    { title: "SN2", pastedSmiles: "CCBr", conditionsLabel: "" },
    [],
    toolkit,
  );
  expect(creation.outcome === "created" && creation.document.authors).toEqual([]);
});

it.each([
  [{ title: "  ", pastedSmiles: "CCBr", conditionsLabel: "" }, "name"],
  [{ title: "SN2", pastedSmiles: "C1CC(", conditionsLabel: "" }, "cannot read"],
])("refuses %j (%s)", (fields, reasonPart) => {
  const creation = createdDraft(fields, [], toolkit);
  expect(creation.outcome === "refused" && creation.reason).toContain(reasonPart);
});

describe("previewOfPastedSmiles", () => {
  it("draws the pasted molecules with every atom", () => {
    const preview = previewOfPastedSmiles("[OH-].CBr", toolkit);
    expect(preview.outcome).toBe("drawn");
    if (preview.outcome === "drawn") {
      expect(preview.drawing.atoms.map((drawnAtom) => drawnAtom.mapNumber)).toEqual([1, 2, 3]);
    }
  });

  it("says nothing for empty text and why for unreadable SMILES", () => {
    expect(previewOfPastedSmiles("  ", toolkit)).toEqual({ outcome: "empty" });
    const preview = previewOfPastedSmiles("C1CC(", toolkit);
    expect(preview.outcome === "refused" && preview.reason).toContain("cannot read");
  });
});
