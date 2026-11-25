/** Tests for draftCreation.ts: the start panel's "New reaction". */
import { beforeAll, expect, it } from "vitest";
import {
  type ChemistryToolkit,
  loadChemistryToolkit,
} from "../chemistryToolkit/chemistryToolkit.js";
import { createdDraft } from "./draftCreation.js";

let toolkit: ChemistryToolkit;

beforeAll(async () => {
  toolkit = await loadChemistryToolkit();
});

it("makes a draft from a slug, a title and pasted SMILES", () => {
  const creation = createdDraft(
    { reactionSlug: "sn2-ethyl", title: " SN2 on bromoethane ", pastedSmiles: "[OH-].CCBr" },
    toolkit,
  );
  expect(creation.outcome).toBe("created");
  if (creation.outcome === "created") {
    expect(creation.document.reactionSlug).toBe("sn2-ethyl");
    expect(creation.document.title).toBe("SN2 on bromoethane");
    expect(
      (creation.document.stateIdToState as Record<string, { mappedSmiles: string }>)["state-1"]
        ?.mappedSmiles,
    ).toBe("[OH-:1].[CH3:2][CH2:3][Br:4]");
  }
});

it.each([
  [{ reactionSlug: "SN2 ethyl", title: "SN2", pastedSmiles: "CCBr" }, "slug"],
  [{ reactionSlug: "sn2-", title: "SN2", pastedSmiles: "CCBr" }, "slug"],
  [{ reactionSlug: "sn2", title: "  ", pastedSmiles: "CCBr" }, "title"],
  [{ reactionSlug: "sn2", title: "SN2", pastedSmiles: "C1CC(" }, "cannot read"],
])("refuses %j (%s)", (fields, reasonPart) => {
  const creation = createdDraft(fields, toolkit);
  expect(creation.outcome === "refused" && creation.reason).toContain(reasonPart);
});
