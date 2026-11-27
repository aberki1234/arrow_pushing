/**
 * Contributors' API (docs/SPEC.md §6, "Contributors"): Submit for review, the review queue and a
 * review, the reviewer's notes, and the owner's Users page. Every route needs a session (401);
 * the database decides who may do what (sitePermissions.ts) and its refusals become the answers
 * of refusalAnswers.ts.
 *
 * Routes (bodies and answers are JSON)
 *   POST /api/reactions/:slug/submit        body {licenceAgreed: boolean, submissionNote?: text};
 *                                           answers {submissionStatus: "submitted"}
 *   GET  /api/reactions/:slug/review-notes  the reviewer's notes while changes are requested, or
 *                                           null
 *   GET  /api/review-queue                  the submissions to review, oldest first
 *   GET  /api/reactions/:slug/review        what the reviewer compares (submissions.ts
 *                                           ReviewMaterial)
 *   POST /api/reactions/:slug/review        body {reviewDecision: "publish" | "changes_requested",
 *                                           comment?: text, pinnedNotes?: [{changeKey, note}]};
 *                                           answers {published: summary | null, deployStart}
 *                                           (the deploy starts only on publish)
 *   GET  /api/users                         every user (the owner only)
 *   PUT  /api/users/:userId/role            body {siteRole}; answers {siteRole}
 * A body that is not of this shape is answered 400.
 */
import { Hono } from "hono";
import type { PinnedNote, SiteRole } from "../reactionDatabase/databaseTables.js";
import { ReactionDatabaseError } from "../reactionDatabase/reactionDatabaseErrors.js";
import { listSiteUsers, setSiteRole } from "../reactionDatabase/siteUsers.js";
import {
  reviewMaterial,
  reviewNotesFor,
  reviewQueue,
  reviewSubmission,
  submitForReview,
} from "../reactionDatabase/submissions.js";
import { type Authentication, requireSignIn } from "./authentication.js";
import { startDeploy } from "./deployDispatch.js";
import { jsonObjectBody } from "./reactionRoutes.js";
import type { ServerDependencies, ServerEnvironment } from "./serverDependencies.js";

/** The longest note (submission, comment or pinned) the server stores. */
export const MAXIMUM_NOTE_LENGTH = 4000;

const MAXIMUM_PINNED_NOTES = 100;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An optional note: undefined → "", a string up to MAXIMUM_NOTE_LENGTH, else undefined (bad). */
function noteFrom(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return "";
  }
  return typeof value === "string" && value.length <= MAXIMUM_NOTE_LENGTH ? value : undefined;
}

function pinnedNotesFrom(value: unknown): PinnedNote[] | undefined {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length > MAXIMUM_PINNED_NOTES) {
    return undefined;
  }
  const pinnedNotes: PinnedNote[] = [];
  for (const entry of value as unknown[]) {
    const { changeKey, note } = (entry ?? {}) as Record<string, unknown>;
    const noteText = noteFrom(note);
    if (typeof changeKey !== "string" || changeKey.length > 500 || noteText === undefined) {
      return undefined;
    }
    if (noteText.trim() !== "") {
      pinnedNotes.push({ changeKey, note: noteText.trim() });
    }
  }
  return pinnedNotes;
}

function addSubmitRoutes(routes: Hono<ServerEnvironment>, dependencies: ServerDependencies): void {
  const { database } = dependencies;
  routes.post("/reactions/:slug/submit", async (context) => {
    const body = (await jsonObjectBody(context)) ?? {};
    const submissionNote = noteFrom(body.submissionNote);
    if (submissionNote === undefined) {
      return context.json({ error: "the note must be text, at most 4000 characters" }, 400);
    }
    await submitForReview(database, {
      reactionSlug: context.req.param("slug"),
      authorUserId: context.get("signedInUser").userId,
      licenceAgreedNow: body.licenceAgreed === true,
      submissionNote,
      lintDocument: dependencies.lintDocument,
    });
    return context.json({ submissionStatus: "submitted" });
  });

  routes.get("/reactions/:slug/review-notes", async (context) =>
    context.json(
      await reviewNotesFor(database, context.req.param("slug"), context.get("signedInUser").userId),
    ),
  );
}

function addReviewRoutes(routes: Hono<ServerEnvironment>, dependencies: ServerDependencies): void {
  const { database } = dependencies;
  routes.get("/review-queue", async (context) =>
    context.json(await reviewQueue(database, context.get("signedInUser").userId)),
  );

  routes.get("/reactions/:slug/review", async (context) =>
    context.json(
      await reviewMaterial(database, context.req.param("slug"), context.get("signedInUser").userId),
    ),
  );

  routes.post("/reactions/:slug/review", async (context) => {
    const body = (await jsonObjectBody(context)) ?? {};
    const { reviewDecision } = body;
    const comment = noteFrom(body.comment);
    const pinnedNotes = pinnedNotesFrom(body.pinnedNotes);
    const isDecision = reviewDecision === "publish" || reviewDecision === "changes_requested";
    if (!isDecision || comment === undefined || pinnedNotes === undefined) {
      return context.json(
        { error: "send reviewDecision, and comment and pinnedNotes as text" },
        400,
      );
    }
    const published = await reviewSubmission(database, {
      reactionSlug: context.req.param("slug"),
      reviewerUserId: context.get("signedInUser").userId,
      reviewDecision,
      comment,
      pinnedNotes,
      lintDocument: dependencies.lintDocument,
    });
    const deployStart =
      published === null
        ? null
        : await startDeploy(dependencies.settings.deploy, dependencies.fetchFunction);
    return context.json({ published, deployStart });
  });
}

const ROLES_FROM_THE_USERS_PAGE: readonly string[] = ["contributor", "reviewer", "blocked"];

function addUserRoutes(routes: Hono<ServerEnvironment>, dependencies: ServerDependencies): void {
  const { database } = dependencies;
  routes.get("/users", async (context) =>
    context.json(await listSiteUsers(database, context.get("signedInUser").userId)),
  );

  routes.put("/users/:userId/role", async (context) => {
    const userId = context.req.param("userId");
    if (!UUID_PATTERN.test(userId)) {
      throw new ReactionDatabaseError("user-not-found", `no user ${userId}`);
    }
    const siteRole = (await jsonObjectBody(context))?.siteRole;
    if (typeof siteRole !== "string") {
      return context.json({ error: "send {siteRole}" }, 400);
    }
    if (!ROLES_FROM_THE_USERS_PAGE.includes(siteRole)) {
      throw new ReactionDatabaseError("role-not-assignable", `"${siteRole}" is not given here`);
    }
    await setSiteRole(database, {
      ownerUserId: context.get("signedInUser").userId,
      userId,
      siteRole: siteRole as SiteRole,
    });
    return context.json({ siteRole });
  });
}

export function contributorRoutes(
  dependencies: ServerDependencies,
  authentication: Authentication,
): Hono<ServerEnvironment> {
  const routes = new Hono<ServerEnvironment>();
  for (const path of ["/reactions/*", "/review-queue", "/users", "/users/*"]) {
    routes.use(path, requireSignIn(authentication, dependencies.database));
  }
  addSubmitRoutes(routes, dependencies);
  addReviewRoutes(routes, dependencies);
  addUserRoutes(routes, dependencies);
  return routes;
}
