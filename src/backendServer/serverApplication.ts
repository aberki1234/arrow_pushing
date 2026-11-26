/**
 * The whole server (docs/SPEC.md §5, backend): Hono's cross-site request check, Better Auth's
 * routes (/api/auth/*), the reaction API, then the built editor's files at every other address.
 *
 * Cross-site requests: the session cookie is SameSite=Lax, so other sites' POSTs carry no session;
 * Hono's csrf() also refuses (403) a form-type POST whose Origin is not the server's own, and
 * Better Auth checks the Origin of its own POSTs.
 */
import { existsSync } from "node:fs";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { ReactionDatabaseError } from "../reactionDatabase/reactionDatabaseErrors.js";
import {
  AUTHENTICATION_BASE_PATH,
  createAuthentication,
  requireSignIn,
  signInProviders,
} from "./authentication.js";
import { contributorRoutes } from "./contributorRoutes.js";
import { reactionRoutes } from "./reactionRoutes.js";
import { refusalBody, refusalHttpStatus } from "./refusalAnswers.js";
import type { ServerDependencies, ServerEnvironment } from "./serverDependencies.js";
import { siteActionsOf } from "../reactionDatabase/sitePermissions.js";

export function createServerApplication(dependencies: ServerDependencies): Hono<ServerEnvironment> {
  const { settings } = dependencies;
  const authentication = createAuthentication(dependencies.database, settings);
  const application = new Hono<ServerEnvironment>();
  application.use(csrf({ origin: settings.publicBaseUrl }));
  application.on(["GET", "POST"], `${AUTHENTICATION_BASE_PATH}/*`, (context) =>
    authentication.handler(context.req.raw),
  );
  application.get("/api/sign-in-providers", (context) => context.json(signInProviders(settings)));
  application.get("/api/me", requireSignIn(authentication), (context) => {
    const { userId, displayName, siteRole } = context.get("signedInUser");
    return context.json({ userId, displayName, siteRole, siteActions: siteActionsOf(siteRole) });
  });
  application.route("/api", reactionRoutes(dependencies, authentication));
  application.route("/api", contributorRoutes(dependencies, authentication));
  application.all("/api/*", (context) => context.json({ error: "no such API route" }, 404));
  // Without a built editor (tests, the API alone) every other address is 404.
  if (existsSync(settings.editorFilesFolder)) {
    application.use("/*", serveStatic({ root: settings.editorFilesFolder }));
  }
  application.onError((error, context) => {
    // Hono's own refusals, such as csrf()'s 403, carry their answer.
    if (error instanceof HTTPException) {
      return error.getResponse();
    }
    if (error instanceof ReactionDatabaseError) {
      return context.json(refusalBody(error), refusalHttpStatus(error.refusalCode));
    }
    throw error;
  });
  return application;
}
