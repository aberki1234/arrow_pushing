/** Tests for workerLinter.ts, with a fake worker that answers through lintRequests.ts. */
import { expect, it } from "vitest";
import { loadChemistryToolkit } from "../../../tooling/chemistryToolkit/chemistryToolkit.js";
import { lintRequestAnswerer, type LintAnswer, type LintRequest } from "./lintRequests.js";
import { exampleReaction } from "../../../testSupport/reactionEdits.js";
import { type LintWorkerPort, workerLinter } from "./workerLinter.js";

/** Answers each request on the next turn, the last request first (as a busy worker might). */
function fakeWorker(): LintWorkerPort {
  const answer = lintRequestAnswerer(loadChemistryToolkit());
  const port: LintWorkerPort = {
    onmessage: null,
    postMessage: (request: LintRequest) => {
      void answer(request).then((answered: LintAnswer) => {
        port.onmessage?.({ data: answered });
      });
    },
  };
  return port;
}

it("resolves each draft's findings, matched to its own request", async () => {
  const lintDraft = workerLinter(fakeWorker());
  const sn2 = exampleReaction("sn2-hydroxide-bromomethane.json");
  const [clean, broken] = await Promise.all([lintDraft(sn2), lintDraft({ ...sn2, steps: [] })]);
  expect(clean).toEqual([]);
  expect(broken.map((finding) => finding.lintRuleId)).toContain("schema-violation");
});
