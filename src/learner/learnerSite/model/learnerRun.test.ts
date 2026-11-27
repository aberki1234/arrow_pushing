/**
 * Tests for learnerRun.ts: one run of one reaction in a run mode, from loading to being recorded
 * in learner progress, with storage, the reaction loader and the clock passed in.
 */
import { describe, expect, test } from "vitest";
import { type Catalogue, readCatalogue } from "../../../core/catalogue/catalogueReading.js";
import {
  type ProgressStorage,
  readDailyInProgress,
  readProgress,
  writeDailyInProgress,
} from "../../learnerProgress/learnerProgress.js";
import { sessionSnapshot } from "../../stepSession/sessionSnapshot.js";
import type { TappedPlace } from "../../stepSession/arrowPicking.js";
import {
  type StepSession,
  checkArrows,
  continueToNextState,
  startStepSession,
  tapPlace,
} from "../../stepSession/stepSession.js";
import { exampleSessionReaction } from "../../../testSupport/exampleSessions.js";
import { isRecord, readFixtureJson } from "../../../testSupport/fixtureFiles.js";
import {
  type LearnerRun,
  type RunDependencies,
  type RunSetting,
  loadRun,
  runAfterStep,
  startRun,
} from "./learnerRun.js";

const SN2_REF = "sn2-hydroxide-bromomethane@1";

function memoryStorage(): ProgressStorage {
  const keyToText = new Map<string, string>();
  return {
    getItem: (key) => keyToText.get(key) ?? null,
    setItem: (key, value): void => {
      keyToText.set(key, value);
    },
    removeItem: (key): void => {
      keyToText.delete(key);
    },
  };
}

const atom = (mapNumber: number): TappedPlace => ({ placeKind: "atom", mapNumber });
const lonePair = (mapNumber: number): TappedPlace => ({ placeKind: "lonePair", mapNumber });
const bond = (first: number, second: number): TappedPlace => ({
  placeKind: "bond",
  mapNumbers: [first, second],
});

/** The SN2 step checked correct on the first try: lp O1 -> σ O1-C2, σ C2-Br3 -> lp Br3. */
function checkedSn2(session: StepSession): StepSession {
  return checkArrows([lonePair(1), atom(2), bond(2, 3), atom(3)].reduce(tapPlace, session));
}

function sessionOf(run: LearnerRun): StepSession {
  if (run.runPhase !== "playing") throw new Error(`the run is ${run.runPhase}, not playing`);
  return run.session;
}

/**
 * The example catalogue plus a second substitution reaction (a copy of the SN2 entry under
 * another slug), so the SN2 reaction has a related reaction.
 */
function catalogueWithRelatedReaction(): Catalogue {
  const cases = readFixtureJson("catalogue/catalogue_reading_cases.json");
  const catalogue = isRecord(cases) && isRecord(cases["catalogue"]) ? cases["catalogue"] : {};
  const reactions: unknown[] = Array.isArray(catalogue["reactions"])
    ? (catalogue["reactions"] as unknown[])
    : [];
  const sn2 = reactions.find(
    (entry) => isRecord(entry) && entry["reactionSlug"] === "sn2-hydroxide-bromomethane",
  );
  const related = isRecord(sn2)
    ? { ...sn2, reactionSlug: "sn2-cyanide-iodoethane", title: "SN2 of iodoethane" }
    : {};
  return readCatalogue({ ...catalogue, reactions: [...reactions, related] });
}

/** Dependencies with in-memory storage, the example reactions and a clock read from `times`. */
function dependencies(times: string[] = ["2026-12-01T09:00:00.000Z"]): RunDependencies {
  let clockReads = 0;
  return {
    catalogue: catalogueWithRelatedReaction(),
    storage: memoryStorage(),
    loadReaction: (reactionVersionRef) =>
      Promise.resolve(exampleSessionReaction(reactionVersionRef.split("@")[0] ?? "")),
    now: () => new Date(times[Math.min(clockReads++, times.length - 1)] ?? ""),
  };
}

/** The SN2 run loaded for `setting` and played to completion on the first try. */
async function finishedSn2(setting: RunSetting, deps: RunDependencies): Promise<LearnerRun> {
  const run = await loadRun(setting, deps);
  return runAfterStep(run, continueToNextState(checkedSn2(sessionOf(run))), deps);
}

describe("a practice run", () => {
  test("loads its reaction and starts playing at the clock's time", async () => {
    const run = await loadRun(
      { runMode: "practice", reactionVersionRef: SN2_REF, inProblemSet: false },
      dependencies(),
    );
    expect(run.runPhase).toBe("playing");
    if (run.runPhase !== "playing") return;
    expect(run.session.reaction.reactionSlug).toBe("sn2-hydroxide-bromomethane");
    expect(run.session.mode).toBe("practice");
    expect(run.session.phase).toBe("drawing");
    expect(run.startedAt).toBe("2026-12-01T09:00:00.000Z");
  });

  test("whose reaction cannot be loaded says why", async () => {
    const run = await loadRun(
      { runMode: "practice", reactionVersionRef: SN2_REF, inProblemSet: false },
      { ...dependencies(), loadReaction: () => Promise.reject(new Error("the site answered 404")) },
    );
    expect(run).toMatchObject({
      runPhase: "loadFailed",
      loadError: "Error: the site answered 404",
    });
  });

  test("keeps playing after a step that does not complete it, and records nothing", async () => {
    const deps = dependencies();
    const run = await loadRun(
      { runMode: "practice", reactionVersionRef: SN2_REF, inProblemSet: false },
      deps,
    );
    const checked = checkedSn2(sessionOf(run));
    const after = runAfterStep(run, checked, deps);
    expect(after.runPhase).toBe("playing");
    expect(sessionOf(after)).toBe(checked);
    expect(readProgress(deps.storage).runs).toEqual([]);
  });
});

describe("a finished practice run", () => {
  test("is recorded in progress once, when it completes, and shows the finished view", async () => {
    const deps = dependencies();
    const run = await loadRun(
      { runMode: "practice", reactionVersionRef: SN2_REF, inProblemSet: false },
      deps,
    );
    const completed = continueToNextState(checkedSn2(sessionOf(run)));
    const finished = runAfterStep(run, completed, deps);
    expect(finished).toMatchObject({
      runPhase: "finished",
      stepResults: completed.stepResults,
      extras: { masteryBefore: null, masteryAfter: 100 },
    });
    const recorded = {
      reactionVersionRef: SN2_REF,
      mode: "practice",
      startedAt: "2026-12-01T09:00:00.000Z",
      stepResults: completed.stepResults,
    };
    expect(readProgress(deps.storage).runs).toEqual([recorded]);
    expect(runAfterStep(finished, completed, deps)).toBe(finished);
    expect(readProgress(deps.storage).runs).toEqual([recorded]);
  });

  test("offers related reactions when finished, unless played from a problem set", async () => {
    const outside = await finishedSn2(
      { runMode: "practice", reactionVersionRef: SN2_REF, inProblemSet: false },
      dependencies(),
    );
    const inSet = await finishedSn2(
      { runMode: "practice", reactionVersionRef: SN2_REF, inProblemSet: true },
      dependencies(),
    );
    if (outside.runPhase !== "finished" || inSet.runPhase !== "finished") {
      throw new Error("both runs should be finished");
    }
    expect(outside.extras.relatedCards.length).toBeGreaterThan(0);
    expect(inSet.extras.relatedCards).toEqual([]);
  });
});

describe("Play again", () => {
  test("starts a finished practice run again at the clock's new time", async () => {
    const deps = dependencies(["2026-12-01T09:00:00.000Z", "2026-12-01T09:05:00.000Z"]);
    const finished = await finishedSn2(
      { runMode: "practice", reactionVersionRef: SN2_REF, inProblemSet: false },
      deps,
    );
    const again = startRun(finished, deps);
    expect(again.runPhase).toBe("playing");
    expect(sessionOf(again).phase).toBe("drawing");
    expect(sessionOf(again).stepResults).toEqual([]);
    expect(again).toMatchObject({ startedAt: "2026-12-01T09:05:00.000Z" });
  });
});

describe("a checkpoint run", () => {
  test("is played by the checkpoint rules and recorded with its problem set", async () => {
    const deps = dependencies();
    const setting: RunSetting = {
      runMode: "checkpoint",
      reactionVersionRef: SN2_REF,
      problemSetRef: "first-mechanisms/checkpoint",
    };
    const run = await loadRun(setting, deps);
    expect(sessionOf(run).mode).toBe("checkpoint");
    const finished = await finishedSn2(setting, deps);
    expect(readProgress(deps.storage).runs.at(-1)).toMatchObject({
      mode: "checkpoint",
      problemSetRef: "first-mechanisms/checkpoint",
    });
    expect(finished).toMatchObject({ runPhase: "finished", extras: { relatedCards: [] } });
  });
});

const PUZZLE = { localDate: "2026-12-01", puzzleNumber: 7, reactionVersionRef: SN2_REF };
const DAILY: RunSetting = { runMode: "daily", puzzle: PUZZLE };

/** Saves an unfinished daily puzzle started on `localDate`. */
function saveUnfinished(storage: ProgressStorage, localDate: string, session: StepSession): void {
  writeDailyInProgress(storage, {
    formatVersion: 1,
    localDate,
    puzzleNumber: PUZZLE.puzzleNumber,
    reactionVersionRef: SN2_REF,
    startedAt: `${localDate}T08:00:00.000Z`,
    snapshot: sessionSnapshot(session),
  });
}

describe("a daily run", () => {
  test("waits to be started, and drops a puzzle left unfinished on an earlier day", async () => {
    const deps = dependencies();
    const sn2 = exampleSessionReaction("sn2-hydroxide-bromomethane");
    saveUnfinished(deps.storage, "2026-11-30", startStepSession(sn2, "daily"));
    const run = await loadRun(DAILY, deps);
    expect(run.runPhase).toBe("notStarted");
    expect(readDailyInProgress(deps.storage)).toBeNull();
  });
});

describe("a daily run being played", () => {
  test("once started, is played by the daily rules and saved as unfinished", async () => {
    const deps = dependencies(["2026-12-01T09:00:00.000Z"]);
    const started = startRun(await loadRun(DAILY, deps), deps);
    expect(started.runPhase).toBe("playing");
    expect(sessionOf(started).mode).toBe("daily");
    expect(readDailyInProgress(deps.storage)).toMatchObject({
      localDate: "2026-12-01",
      puzzleNumber: 7,
      reactionVersionRef: SN2_REF,
      startedAt: "2026-12-01T09:00:00.000Z",
    });
  });

  test("is saved after every check and resumed where it was left, at its start time", async () => {
    const deps = dependencies(["2026-12-01T09:00:00.000Z"]);
    const started = startRun(await loadRun(DAILY, deps), deps);
    const wrong = checkArrows([lonePair(1), atom(3)].reduce(tapPlace, sessionOf(started)));
    runAfterStep(started, wrong, deps);
    expect(readDailyInProgress(deps.storage)?.snapshot).toEqual(sessionSnapshot(wrong));
    const resumed = await loadRun(DAILY, deps);
    expect(resumed).toMatchObject({ runPhase: "playing", startedAt: "2026-12-01T09:00:00.000Z" });
    expect(sessionOf(resumed)).toMatchObject({ phase: "drawing", wrongCheckCount: 1 });
  });
});

describe("a finished daily run", () => {
  test("saved after its last step was checked, is finished and recorded on return", async () => {
    const deps = dependencies(["2026-12-01T09:00:00.000Z"]);
    const started = startRun(await loadRun(DAILY, deps), deps);
    runAfterStep(started, checkedSn2(sessionOf(started)), deps);
    const returned = await loadRun(DAILY, deps);
    expect(returned.runPhase).toBe("finished");
    expect(readProgress(deps.storage).runs).toHaveLength(1);
    expect(readDailyInProgress(deps.storage)).toBeNull();
  });

  test("records its daily result for the puzzle's date when it completes", async () => {
    const deps = dependencies(["2026-12-01T09:00:00.000Z"]);
    const started = startRun(await loadRun(DAILY, deps), deps);
    const finished = runAfterStep(
      started,
      continueToNextState(checkedSn2(sessionOf(started))),
      deps,
    );
    const dailyResult = {
      reactionVersionRef: SN2_REF,
      puzzleNumber: 7,
      runStartedAt: "2026-12-01T09:00:00.000Z",
      shareGrid: "🟩",
      score: 3,
    };
    expect(finished).toMatchObject({ runPhase: "finished", dailyResult });
    expect(readProgress(deps.storage).dateToDailyResult).toEqual({ "2026-12-01": dailyResult });
  });
});

describe("a daily run finished earlier", () => {
  test("opens on that run's finished view the same day", async () => {
    const deps = dependencies(["2026-12-01T09:00:00.000Z"]);
    const started = startRun(await loadRun(DAILY, deps), deps);
    const completed = continueToNextState(checkedSn2(sessionOf(started)));
    runAfterStep(started, completed, deps);
    const reopened = await loadRun(DAILY, deps);
    expect(reopened).toMatchObject({
      runPhase: "finished",
      startedAt: "2026-12-01T09:00:00.000Z",
      stepResults: completed.stepResults,
      dailyResult: { puzzleNumber: 7, shareGrid: "🟩" },
      extras: { masteryBefore: 100, masteryAfter: 100 },
    });
    expect(readProgress(deps.storage).runs).toHaveLength(1);
  });

  test("once finished, cannot be started again", async () => {
    const deps = dependencies(["2026-12-01T09:00:00.000Z"]);
    const started = startRun(await loadRun(DAILY, deps), deps);
    const finished = runAfterStep(
      started,
      continueToNextState(checkedSn2(sessionOf(started))),
      deps,
    );
    expect(startRun(finished, deps)).toBe(finished);
    expect(readDailyInProgress(deps.storage)).toBeNull();
  });
});
