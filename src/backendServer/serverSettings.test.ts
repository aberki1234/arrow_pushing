/**
 * Tests for serverSettings.ts: every variable of the module comment is read, defaults are applied,
 * and each problem is named, so a misconfigured Render service fails at start with a clear message.
 */
import { describe, expect, it } from "vitest";
import { readServerSettings, ServerSettingsError } from "./serverSettings.js";

const COMPLETE_ENVIRONMENT = {
  DATABASE_URL: "postgres://user:password@pooler.example.com:6543/postgres",
  PUBLIC_BASE_URL: "https://arrowpush.onrender.com/",
  BETTER_AUTH_SECRET: "a".repeat(32),
  GITHUB_CLIENT_ID: "client-id",
  GITHUB_CLIENT_SECRET: "client-secret",
  ALLOWED_GITHUB_USER_IDS: " 1001, 2002 ",
  DEPLOY_REPOSITORY: "owner/mech_training",
  DEPLOY_DISPATCH_TOKEN: "dispatch-token",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  EDITOR_FILES_FOLDER: "/srv/editor",
  PORT: "10000",
};

function settingsProblem(environment: Record<string, string | undefined>): string {
  try {
    readServerSettings(environment);
  } catch (error) {
    expect(error).toBeInstanceOf(ServerSettingsError);
    return (error as ServerSettingsError).message;
  }
  throw new Error("expected a ServerSettingsError");
}

describe("reading the settings", () => {
  it("reads every variable, without the base address's trailing slash", () => {
    expect(readServerSettings(COMPLETE_ENVIRONMENT)).toEqual({
      databaseUrl: COMPLETE_ENVIRONMENT.DATABASE_URL,
      publicBaseUrl: "https://arrowpush.onrender.com",
      signIn: {
        betterAuthSecret: "a".repeat(32),
        githubClientId: "client-id",
        githubClientSecret: "client-secret",
        allowedGithubUserIds: ["1001", "2002"],
        google: { clientId: "google-client-id", clientSecret: "google-client-secret" },
      },
      deploy: { repository: "owner/mech_training", dispatchToken: "dispatch-token" },
      editorFilesFolder: "/srv/editor",
      port: 10000,
    });
  });

  it("applies the defaults: no deploy, no Google, build/editor, port 3000", () => {
    const {
      DEPLOY_REPOSITORY: deployRepository,
      DEPLOY_DISPATCH_TOKEN: dispatchToken,
      GOOGLE_CLIENT_ID: googleClientId,
      GOOGLE_CLIENT_SECRET: googleClientSecret,
      EDITOR_FILES_FOLDER: editorFilesFolder,
      PORT: port,
      ...required
    } = COMPLETE_ENVIRONMENT;
    expect([deployRepository, dispatchToken, googleClientId, googleClientSecret]).toHaveLength(4);
    expect([editorFilesFolder, port]).toHaveLength(2);
    const settings = readServerSettings(required);
    expect(settings.signIn.google).toBeNull();
    expect(settings).toMatchObject({
      deploy: null,
      editorFilesFolder: "build/editor",
      port: 3000,
    });
  });
});

describe("refusing settings", () => {
  it("names every missing required variable at once", () => {
    const problem = settingsProblem({
      ...COMPLETE_ENVIRONMENT,
      DATABASE_URL: "",
      GITHUB_CLIENT_ID: undefined,
    });
    expect(problem).toContain("DATABASE_URL");
    expect(problem).toContain("GITHUB_CLIENT_ID");
  });

  it("refuses a short secret, a non-numeric or empty allow-list, a bad port", () => {
    expect(settingsProblem({ ...COMPLETE_ENVIRONMENT, BETTER_AUTH_SECRET: "short" })).toContain(
      "BETTER_AUTH_SECRET",
    );
    for (const allowList of ["owner-login", "1001,", " , "]) {
      expect(
        settingsProblem({ ...COMPLETE_ENVIRONMENT, ALLOWED_GITHUB_USER_IDS: allowList }),
      ).toContain("ALLOWED_GITHUB_USER_IDS");
    }
    expect(settingsProblem({ ...COMPLETE_ENVIRONMENT, PORT: "http" })).toContain("PORT");
  });

  it("refuses a base address not http(s), and half of the deploy or Google pair", () => {
    expect(
      settingsProblem({ ...COMPLETE_ENVIRONMENT, PUBLIC_BASE_URL: "arrowpush.com" }),
    ).toContain("PUBLIC_BASE_URL");
    expect(settingsProblem({ ...COMPLETE_ENVIRONMENT, DEPLOY_DISPATCH_TOKEN: "" })).toContain(
      "DEPLOY_REPOSITORY and DEPLOY_DISPATCH_TOKEN",
    );
    expect(settingsProblem({ ...COMPLETE_ENVIRONMENT, GOOGLE_CLIENT_SECRET: " " })).toContain(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET",
    );
  });
});
