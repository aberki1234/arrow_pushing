/**
 * The shell entry of the server's command line (commandLine.ts): `npx tsx` runs this file
 * (`make server`). Settings come from the environment (serverSettings.ts).
 */
import { serve } from "@hono/node-server";
import { loadChemistryToolkit } from "../../tooling/chemistryToolkit/chemistryToolkit.js";
import { mintAccessToken, revokeAccessToken } from "../reactionDatabase/accessTokens.js";
import { importReactionFiles } from "../reactionDatabase/contentImport.js";
import type { DatabaseConnection } from "../reactionDatabase/databaseTables.js";
import { applyMigrations } from "../reactionDatabase/migrationRunning.js";
import { newPostgresConnection } from "../reactionDatabase/postgresConnection.js";
import { lintReaction } from "../../tooling/reactionLinting/rules/reactionLint.js";
import { type BackendCommand, parseBackendCommand } from "./commandLine.js";
import { userIdForGithubAccount } from "./ownerAccount.js";
import type { LintDocument } from "./serverDependencies.js";
import { createServerApplication } from "./serverApplication.js";
import { readServerSettings, type ServerSettings } from "./serverSettings.js";

async function fullLinter(): Promise<LintDocument> {
  const toolkit = await loadChemistryToolkit();
  return (reactionDocument) => lintReaction(reactionDocument, toolkit);
}

async function serveEditor(
  connection: DatabaseConnection,
  settings: ServerSettings,
): Promise<void> {
  const application = createServerApplication({
    database: connection.database,
    settings,
    lintDocument: await fullLinter(),
    fetchFunction: (url, init) => fetch(url, init),
  });
  serve({ fetch: application.fetch, port: settings.port }, (address) => {
    console.log(`listening on port ${String(address.port)}`);
  });
}

async function importFiles(
  connection: DatabaseConnection,
  settings: ServerSettings,
  command: Extract<BackendCommand, { commandName: "import" }>,
): Promise<void> {
  const ownerGithubUserId = settings.signIn.allowedGithubUserIds[0] ?? "";
  const importSummary = await importReactionFiles(connection.database, {
    publishedFilePaths: command.publishedFilePaths,
    draftFilePaths: command.draftFilePaths,
    ownerUserId: await userIdForGithubAccount(connection.database, ownerGithubUserId),
    lintDocument: await fullLinter(),
  });
  console.log(JSON.stringify(importSummary, null, 2));
}

/** create-token and revoke-token. The plain token is printed once and never stored. */
async function manageAccessToken(
  connection: DatabaseConnection,
  command: Extract<BackendCommand, { commandName: "create-token" | "revoke-token" }>,
): Promise<void> {
  if (command.commandName === "revoke-token") {
    await revokeAccessToken(connection.database, command.accessTokenId, new Date());
    console.log(`revoked ${command.accessTokenId}`);
    return;
  }
  const minted = await mintAccessToken(connection.database, { ...command, now: new Date() });
  console.log(`token id ${minted.accessTokenId}, expires ${minted.expiresAt.toISOString()}`);
  console.log("the token (shown once; keep it secret):");
  console.log(minted.plainToken);
}

async function runBackendCommand(command: BackendCommand): Promise<void> {
  const settings = readServerSettings(process.env);
  const connection = newPostgresConnection(settings.databaseUrl);
  const appliedNow = await applyMigrations(connection);
  console.log(`migrations applied now: ${appliedNow.join(", ") || "none"}`);
  if (command.commandName === "serve") {
    // The connection stays open while the server runs.
    await serveEditor(connection, settings);
    return;
  }
  try {
    if (command.commandName === "import") {
      await importFiles(connection, settings, command);
    } else if (command.commandName !== "migrate") {
      await manageAccessToken(connection, command);
    }
  } finally {
    await connection.close();
  }
}

try {
  await runBackendCommand(parseBackendCommand(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
