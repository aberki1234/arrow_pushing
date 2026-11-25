/**
 * Tests for publishing.ts: Publish lints on the server, records the licence agreement once per
 * author, and moves the draft to published in one transaction. The content hash is checked
 * against catalogueBuilding's contentHashOf, which names the static build's files.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { contentHashOf } from "../catalogueBuilding/staticFileNaming.js";
import {
  type ChemistryToolkit,
  loadChemistryToolkit,
} from "../chemistryToolkit/chemistryToolkit.js";
import type { LintFinding } from "../reactionLinting/lintFindings.js";
import { lintReaction } from "../reactionLinting/reactionLint.js";
import { exampleReaction } from "../testSupport/reactionEdits.js";
import {
  DATABASE_SETUP_TIMEOUT_MS,
  emptyAllTables,
  insertUser,
  newMigratedDatabase,
} from "../testSupport/temporaryDatabase.js";
import type { DatabaseConnection, ReactionDatabase } from "./databaseTables.js";
import { publishDraft, type PublishRequest } from "./publishing.js";
import { ReactionDatabaseError } from "./reactionDatabaseErrors.js";
import { readReactionVersion, saveDraft, startNextVersion } from "./reactionVersions.js";

let connection: DatabaseConnection;
let database: ReactionDatabase;
let toolkit: ChemistryToolkit;
let ownerUserId: string;

beforeAll(async () => {
  connection = await newMigratedDatabase();
  database = connection.database;
  toolkit = await loadChemistryToolkit();
}, DATABASE_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await connection.close();
});

beforeEach(async () => {
  await emptyAllTables(connection);
  ownerUserId = await insertUser(connection, "owner");
});

const SN2_SLUG = "sn2-hydroxide-bromomethane";

function sn2Document(): Record<string, unknown> {
  return exampleReaction("sn2-hydroxide-bromomethane.json");
}

function fullLint(reactionDocument: Readonly<Record<string, unknown>>): LintFinding[] {
  return lintReaction(reactionDocument, toolkit);
}

function publishRequest(overrides: Partial<PublishRequest> = {}): PublishRequest {
  return {
    reactionSlug: SN2_SLUG,
    publisherUserId: ownerUserId,
    licenceAgreedNow: true,
    lintDocument: fullLint,
    ...overrides,
  };
}

async function expectRefusal(
  pending: Promise<unknown>,
  refusalCode: string,
): Promise<ReactionDatabaseError> {
  const refusal: unknown = await pending.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(refusal).toBeInstanceOf(ReactionDatabaseError);
  expect((refusal as ReactionDatabaseError).refusalCode).toBe(refusalCode);
  return refusal as ReactionDatabaseError;
}

describe("publishing a clean draft", () => {
  it("publishes with the content hash, the dates and the lint report", async () => {
    await saveDraft(database, sn2Document(), ownerUserId);
    const summary = await publishDraft(database, publishRequest());
    expect(summary).toEqual({
      reactionSlug: SN2_SLUG,
      reactionVersion: 1,
      contentHash: contentHashOf(sn2Document()),
      lintWarnings: [],
    });
    const stored = await readReactionVersion(database, SN2_SLUG, 1);
    expect(stored.submissionStatus).toBe("published");
    expect(stored.contentHash).toBe(contentHashOf(sn2Document()));
    expect(stored.publishedAt).toBeInstanceOf(Date);
    expect(stored.latestLintReport).toEqual([]);
    const timestamps = await database
      .selectFrom("arrowpush.reactionVersions")
      .select(["submittedAt", "licenceAgreedAt"])
      .executeTakeFirstOrThrow();
    expect(timestamps.submittedAt).toBeInstanceOf(Date);
    expect(timestamps.licenceAgreedAt).toBeInstanceOf(Date);
  });

  it("returns lint warnings without refusing", async () => {
    const warning: LintFinding = {
      lintRuleId: "hint-tiers-fewer-than-three",
      lintLevel: "warning",
      instancePath: "/stateIdToState/reactants",
      message: "fewer than three hint tiers",
    };
    await saveDraft(database, sn2Document(), ownerUserId);
    const summary = await publishDraft(database, publishRequest({ lintDocument: () => [warning] }));
    expect(summary.lintWarnings).toEqual([warning]);
  });

  it("makes the published version immutable: saving again is refused", async () => {
    await saveDraft(database, sn2Document(), ownerUserId);
    await publishDraft(database, publishRequest());
    await expectRefusal(saveDraft(database, sn2Document(), ownerUserId), "no-unpublished-version");
  });
});

describe("refusing to publish", () => {
  it("refuses a draft with lint errors, keeping the report", async () => {
    await saveDraft(database, { ...sn2Document(), title: "" }, ownerUserId);
    const refusal = await expectRefusal(
      publishDraft(database, publishRequest()),
      "draft-has-lint-errors",
    );
    expect(refusal.lintFindings.map((finding) => finding.lintRuleId)).toContain("schema-violation");
    const stored = await readReactionVersion(database, SN2_SLUG, 1);
    expect(stored.submissionStatus).toBe("draft");
    expect(stored.latestLintReport).toEqual(refusal.lintFindings);
  });

  it("refuses when the licence was never agreed", async () => {
    await saveDraft(database, sn2Document(), ownerUserId);
    await expectRefusal(
      publishDraft(database, publishRequest({ licenceAgreedNow: false })),
      "licence-not-agreed",
    );
    expect((await readReactionVersion(database, SN2_SLUG, 1)).submissionStatus).toBe("draft");
  });

  it("refuses an unknown slug and a reaction with no draft", async () => {
    await expectRefusal(
      publishDraft(database, publishRequest({ reactionSlug: "no-such" })),
      "reaction-not-found",
    );
    await saveDraft(database, sn2Document(), ownerUserId);
    await publishDraft(database, publishRequest());
    await expectRefusal(publishDraft(database, publishRequest()), "no-unpublished-version");
  });

  it("refuses a contributor", async () => {
    await saveDraft(database, sn2Document(), ownerUserId);
    const contributorUserId = await insertUser(connection, "contributor", "contributor");
    await expectRefusal(
      publishDraft(database, publishRequest({ publisherUserId: contributorUserId })),
      "not-allowed-to-publish",
    );
  });
});

describe("the licence is agreed once per author", () => {
  it("publishes version 2 without a new tick, reusing the first agreement's date", async () => {
    await saveDraft(database, sn2Document(), ownerUserId);
    await publishDraft(database, publishRequest());
    await startNextVersion(database, SN2_SLUG, ownerUserId);
    const secondSummary = await publishDraft(database, publishRequest({ licenceAgreedNow: false }));
    expect(secondSummary.reactionVersion).toBe(2);
    const agreementDates = await database
      .selectFrom("arrowpush.reactionVersions")
      .select("licenceAgreedAt")
      .orderBy("reactionVersion")
      .execute();
    expect(agreementDates[1]?.licenceAgreedAt).toEqual(agreementDates[0]?.licenceAgreedAt);
  });
});
