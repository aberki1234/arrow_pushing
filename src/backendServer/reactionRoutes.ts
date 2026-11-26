/**
 * The editor's reaction API (docs/SPEC.md §5, backend). Every route under /api/reactions needs a
 * session (401 otherwise); refusals of the database become the answers of refusalAnswers.ts.
 *
 * Routes (bodies and answers are JSON)
 *   GET  /api/reactions                               the reaction listings (reactionVersions.ts
 *                                                     listReactionsFor: every reaction with
 *                                                     "seeEveryReaction", else the user's own and
 *                                                     every published one), each with its
 *                                                     creationProgress instead of its document
 *   GET  /api/reactions/:slug                         the newest version (as one stored version)
 *   GET  /api/reactions/:slug/versions/:version       one stored version
 *   PUT  /api/reactions/:slug/draft                   body: the reaction document; its
 *                                                     reactionSlug must be :slug (400)
 *   POST /api/reactions/:slug/next-version            "Edit" (or "Suggest version n+1" of
 *                                                     someone else's): version n+1 as a draft
 *   POST /api/reactions/:slug/publish                 body {licenceAgreed: boolean}; answers the
 *                                                     publish summary and {deployStart} (one's
 *                                                     own version; others' go through review,
 *                                                     contributorRoutes.ts)
 *   GET  /api/published-versions                      every published version (no session: they
 *                                                     are public on the learner site anyway)
 */
import { type Context, Hono } from "hono";
import type { ReactionDatabase } from "../reactionDatabase/databaseTables.js";
import { publishedVersionsForExport } from "../reactionDatabase/publishedExport.js";
import { publishDraft } from "../reactionDatabase/publishing.js";
import { ReactionDatabaseError } from "../reactionDatabase/reactionDatabaseErrors.js";
import {
  findReaction,
  listReactionsFor,
  readReactionVersion,
  saveDraft,
  startNextVersion,
} from "../reactionDatabase/reactionVersions.js";
import { creationProgress } from "../reactionEditing/creationProgress.js";
import { type Authentication, requireSignIn } from "./authentication.js";
import { startDeploy } from "./deployDispatch.js";
import type { ServerDependencies, ServerEnvironment } from "./serverDependencies.js";

type ReactionDocument = Record<string, unknown>;

function isJsonObject(value: unknown): value is ReactionDocument {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The request's JSON body if it is an object, else undefined (no body, bad JSON, an array). */
export async function jsonObjectBody(context: Context): Promise<ReactionDocument | undefined> {
  try {
    const body: unknown = await context.req.json();
    return isJsonObject(body) ? body : undefined;
  } catch {
    return undefined;
  }
}

/** The address's version number; a version that is not a positive whole number is not found. */
function versionNumberFrom(versionText: string): number {
  if (!/^[1-9][0-9]*$/.test(versionText)) {
    throw new ReactionDatabaseError("version-not-found", `no version "${versionText}"`);
  }
  return Number(versionText);
}

/** Listing, reading, saving a draft and "Edit" (version n+1). */
function addVersionRoutes(routes: Hono<ServerEnvironment>, database: ReactionDatabase): void {
  routes.get("/reactions", async (context) => {
    const listings = await listReactionsFor(database, context.get("signedInUser").userId);
    return context.json(
      listings.map(({ newestReactionDocument, ...listing }) => ({
        ...listing,
        creationProgress: creationProgress(newestReactionDocument),
      })),
    );
  });

  routes.get("/reactions/:slug", async (context) => {
    const reactionSlug = context.req.param("slug");
    const reaction = await findReaction(database, reactionSlug);
    if (reaction === undefined) {
      throw new ReactionDatabaseError("reaction-not-found", `no reaction "${reactionSlug}"`);
    }
    return context.json(
      await readReactionVersion(database, reactionSlug, reaction.newestReactionVersion),
    );
  });

  routes.get("/reactions/:slug/versions/:version", async (context) => {
    const reactionVersion = versionNumberFrom(context.req.param("version"));
    return context.json(
      await readReactionVersion(database, context.req.param("slug"), reactionVersion),
    );
  });

  routes.put("/reactions/:slug/draft", async (context) => {
    const reactionDocument = await jsonObjectBody(context);
    if (reactionDocument === undefined) {
      return context.json({ error: "the body must be a reaction document (a JSON object)" }, 400);
    }
    if (reactionDocument.reactionSlug !== context.req.param("slug")) {
      return context.json({ error: "the document's reactionSlug is not the address's" }, 400);
    }
    const { userId } = context.get("signedInUser");
    return context.json(await saveDraft(database, reactionDocument, userId));
  });

  routes.post("/reactions/:slug/next-version", async (context) => {
    const { userId } = context.get("signedInUser");
    return context.json(await startNextVersion(database, context.req.param("slug"), userId));
  });
}

/** Publish, then start the deploy workflow (a failed start does not undo the publish). */
function addPublishRoute(routes: Hono<ServerEnvironment>, dependencies: ServerDependencies): void {
  routes.post("/reactions/:slug/publish", async (context) => {
    const publishBody = await jsonObjectBody(context);
    const publishedSummary = await publishDraft(dependencies.database, {
      reactionSlug: context.req.param("slug"),
      publisherUserId: context.get("signedInUser").userId,
      licenceAgreedNow: publishBody?.licenceAgreed === true,
      lintDocument: dependencies.lintDocument,
    });
    const deployStart = await startDeploy(dependencies.settings.deploy, dependencies.fetchFunction);
    return context.json({ ...publishedSummary, deployStart });
  });
}

export function reactionRoutes(
  dependencies: ServerDependencies,
  authentication: Authentication,
): Hono<ServerEnvironment> {
  const routes = new Hono<ServerEnvironment>();
  routes.get("/published-versions", async (context) =>
    context.json(await publishedVersionsForExport(dependencies.database)),
  );
  routes.use("/reactions", requireSignIn(authentication));
  routes.use("/reactions/*", requireSignIn(authentication));
  addVersionRoutes(routes, dependencies.database);
  addPublishRoute(routes, dependencies);
  return routes;
}
