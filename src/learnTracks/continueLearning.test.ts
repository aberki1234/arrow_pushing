/** Tests for continueLearning.ts on the example track (see trackProgress.test.ts). */
import { expect, it } from "vitest";
import {
  emptyProgress,
  withLastProblemSetRef,
  withRun,
} from "../learnerProgress/learnerProgress.js";
import { runOf, stepOf } from "../testSupport/progressExamples.js";
import { exampleLearnCatalogue } from "../testSupport/trackEdits.js";
import { continueLearning } from "./continueLearning.js";

it("nothing to continue before a problem set is touched", () => {
  expect(continueLearning(exampleLearnCatalogue(), emptyProgress())).toBeNull();
});

it("the last problem set touched and its Next up", () => {
  const progress = withRun(
    withLastProblemSetRef(emptyProgress(), "first-mechanisms/polar-steps"),
    runOf("sn2-hydroxide-bromomethane@1", "2026-12-01T09:00:00Z", [stepOf("firstTry")]),
  );
  const card = continueLearning(exampleLearnCatalogue(), progress);
  expect(card?.track.trackSlug).toBe("first-mechanisms");
  expect(card?.problemSet.problemSetSlug).toBe("polar-steps");
  expect(card?.nextUp?.reactionSlug).toBe("aldol-addition-base");
});

it("a problem set no longer in the catalogue is nothing to continue", () => {
  const progress = withLastProblemSetRef(emptyProgress(), "first-mechanisms/withdrawn");
  expect(continueLearning(exampleLearnCatalogue(), progress)).toBeNull();
});
