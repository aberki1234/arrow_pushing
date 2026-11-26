/**
 * The built editor's store: reactions in the backend's database, through its API
 * (backendServer/reactionRoutes.ts), on the same address as the editor, so the browser sends the
 * session cookie itself. Besides listing, reading and saving drafts it says who is signed in and
 * publishes (signing in, submitting and review: contributorClient.ts).
 *
 * A reaction is named "<slug>.json" here too, as in content/reactions/ (reactionFileStore.ts).
 * Reading one reads its newest version.
 */
import type { CreationProgress } from "../reactionEditing/creationProgress.js";
import type { ListedReactionFile, ReactionFileStore } from "./reactionFileStore.js";

export const SERVER_STORAGE_PLACE = "the server";

/** Whether Publish asked the deploy workflow to run (backendServer/deployDispatch.ts). */
export type DeployStart = "started" | "not-configured" | "failed";

export type PublishOutcome =
  | {
      readonly outcome: "published";
      readonly reactionVersion: number;
      readonly lintWarningCount: number;
      readonly deployStart: DeployStart;
    }
  | {
      readonly outcome: "refused";
      /** The server's reason. */
      readonly reason: string;
      /** For a draft with lint errors: how many findings the server's lint gave. */
      readonly lintFindingCount: number;
    };

/** Who is signed in, and what their site role allows (reactionDatabase/sitePermissions.ts). */
export interface SignedInUser {
  readonly userId: string;
  readonly displayName: string;
  readonly siteActions: readonly string[];
}

export interface ReactionPublishing {
  /** The signed-in user, or null when not signed in. */
  signedInUser(): Promise<SignedInUser | null>;
  publish(reactionSlug: string, licenceAgreed: boolean): Promise<PublishOutcome>;
  /** "Edit": the next version as a draft; returns its number. */
  startNextVersion(reactionSlug: string): Promise<number>;
}

export type ServerReactionStore = ReactionFileStore & ReactionPublishing;

const REACTIONS_PATH = "/api/reactions";

/** "sn2.json" -> "sn2". */
export function slugOfFileName(fileName: string): string {
  return fileName.replace(/\.json$/, "");
}

/** A listing as the server answers it (reactionDatabase/reactionVersions.ReactionListing). */
interface ServerListing {
  readonly reactionSlug: string;
  readonly title: string | null;
  readonly newestReactionVersion: number;
  readonly newestSubmissionStatus: string;
  readonly ownerUserId: string;
  readonly ownerName: string;
  readonly newestAuthorUserId: string;
  readonly newestAuthorName: string;
  readonly creationProgress: CreationProgress;
}

interface ServerAnswer {
  readonly status: number;
  readonly body: Record<string, unknown> | unknown[] | null;
}

async function answerOf(response: Response): Promise<ServerAnswer> {
  const text = await response.text();
  return {
    status: response.status,
    body: text === "" ? null : (JSON.parse(text) as ServerAnswer["body"]),
  };
}

function bodyField(answer: ServerAnswer, fieldName: string): unknown {
  return answer.body !== null && !Array.isArray(answer.body) ? answer.body[fieldName] : undefined;
}

/** The answer's body when the request succeeded; otherwise throws the server's error message. */
function successfulBody(answer: ServerAnswer): ServerAnswer["body"] {
  if (answer.status >= 200 && answer.status < 300) {
    return answer.body;
  }
  const error = bodyField(answer, "error");
  throw new Error(
    typeof error === "string" ? error : `the server answered ${String(answer.status)}`,
  );
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function listedReactionOf(listing: ServerListing): ListedReactionFile {
  return {
    fileName: `${listing.reactionSlug}.json`,
    reactionSlug: listing.reactionSlug,
    title: listing.title,
    newestReactionVersion: listing.newestReactionVersion,
    newestSubmissionStatus: listing.newestSubmissionStatus,
    ownerUserId: listing.ownerUserId,
    ownerName: listing.ownerName,
    newestAuthorUserId: listing.newestAuthorUserId,
    newestAuthorName: listing.newestAuthorName,
    creationProgress: listing.creationProgress,
  };
}

function publishOutcomeOf(answer: ServerAnswer): PublishOutcome {
  if (answer.status === 200) {
    const lintWarnings = bodyField(answer, "lintWarnings");
    return {
      outcome: "published",
      reactionVersion: Number(bodyField(answer, "reactionVersion")),
      lintWarningCount: Array.isArray(lintWarnings) ? lintWarnings.length : 0,
      deployStart: bodyField(answer, "deployStart") as DeployStart,
    };
  }
  const reason = bodyField(answer, "error");
  const lintFindings = bodyField(answer, "lintFindings");
  return {
    outcome: "refused",
    reason: typeof reason === "string" ? reason : `the server answered ${String(answer.status)}`,
    lintFindingCount: Array.isArray(lintFindings) ? lintFindings.length : 0,
  };
}

/** /api/me's answer: the user and their site actions, or null without a session. */
function signedInUserOf(meAnswer: ServerAnswer): SignedInUser | null {
  const displayName = bodyField(meAnswer, "displayName");
  const siteActions = bodyField(meAnswer, "siteActions");
  if (meAnswer.status !== 200 || typeof displayName !== "string") {
    return null;
  }
  return {
    userId: String(bodyField(meAnswer, "userId")),
    displayName,
    siteActions: Array.isArray(siteActions) ? siteActions.map(String) : [],
  };
}

/** The store over the API; `fetchFunction` is the browser's fetch unless a test passes another. */
export function serverReactionStore(fetchFunction: typeof fetch = fetch): ServerReactionStore {
  const request = async (path: string, init?: RequestInit): Promise<ServerAnswer> =>
    answerOf(await fetchFunction(path, init));
  return {
    storagePlace: SERVER_STORAGE_PLACE,
    list: async (): Promise<ListedReactionFile[]> => {
      const listings = successfulBody(await request(REACTIONS_PATH)) as ServerListing[];
      return listings.map(listedReactionOf);
    },
    read: async (fileName): Promise<Record<string, unknown>> => {
      const storedVersion = await request(`${REACTIONS_PATH}/${slugOfFileName(fileName)}`);
      successfulBody(storedVersion);
      return bodyField(storedVersion, "reactionDocument") as Record<string, unknown>;
    },
    save: async (fileName, document): Promise<void> => {
      const draftPath = `${REACTIONS_PATH}/${slugOfFileName(fileName)}/draft`;
      successfulBody(await request(draftPath, jsonRequest("PUT", document)));
    },
    signedInUser: async (): Promise<SignedInUser | null> =>
      signedInUserOf(await request("/api/me")),
    publish: async (reactionSlug, licenceAgreed): Promise<PublishOutcome> =>
      publishOutcomeOf(
        await request(
          `${REACTIONS_PATH}/${reactionSlug}/publish`,
          jsonRequest("POST", { licenceAgreed }),
        ),
      ),
    startNextVersion: async (reactionSlug): Promise<number> => {
      const nextVersionAnswer = await request(`${REACTIONS_PATH}/${reactionSlug}/next-version`, {
        method: "POST",
      });
      successfulBody(nextVersionAnswer);
      return Number(bodyField(nextVersionAnswer, "reactionVersion"));
    },
  };
}

function countText(count: number, singular: string): string {
  return `${String(count)} ${singular}${count === 1 ? "" : "s"}`;
}

const DEPLOY_START_TO_SENTENCE: Record<DeployStart, string> = {
  started: "The learner site is being rebuilt.",
  "not-configured": "No site rebuild is set up on this server.",
  failed: "The site rebuild could not be started: the next Publish will include this version.",
};

/** The editor's message after a publish attempt. */
export function publishOutcomeMessage(outcome: PublishOutcome): {
  readonly tone: "good" | "bad";
  readonly text: string;
} {
  if (outcome.outcome === "refused") {
    const findingsNote =
      outcome.lintFindingCount > 0
        ? ` (${countText(outcome.lintFindingCount, "finding")}: see the Lint tab)`
        : "";
    return { tone: "bad", text: `Not published: ${outcome.reason}${findingsNote}` };
  }
  const warningsNote =
    outcome.lintWarningCount > 0 ? ` (${countText(outcome.lintWarningCount, "lint warning")})` : "";
  return {
    tone: outcome.deployStart === "failed" ? "bad" : "good",
    text:
      `Published version ${String(outcome.reactionVersion)}${warningsNote}. ` +
      DEPLOY_START_TO_SENTENCE[outcome.deployStart],
  };
}
