/**
 * After a publish, start the deploy workflow (docs/SPEC.md §5, backend, "Publishing"): a GitHub
 * repository_dispatch event, which the workflow listens for. It exports the published versions,
 * commits the backup, builds the learner site and deploys it to Cloudflare Pages.
 */
import type { FetchFunction } from "./serverDependencies.js";
import type { DeploySettings } from "./serverSettings.js";

/** The repository_dispatch event type the deploy workflow listens for. */
export const DEPLOY_EVENT_TYPE = "reaction-published";

/** Whether the deploy workflow was asked to run. */
export type DeployStart = "started" | "not-configured" | "failed";

const GITHUB_API_ADDRESS = "https://api.github.com";

/**
 * Ask GitHub to run the deploy workflow. Never throws: a publish has already happened, so a failed
 * request is reported ("failed") for the editor to show, and the next publish deploys everything.
 */
export async function startDeploy(
  deploy: DeploySettings | null,
  fetchFunction: FetchFunction,
): Promise<DeployStart> {
  if (deploy === null) {
    return "not-configured";
  }
  try {
    const dispatchResponse = await fetchFunction(
      `${GITHUB_API_ADDRESS}/repos/${deploy.repository}/dispatches`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${deploy.dispatchToken}`,
          accept: "application/vnd.github+json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ event_type: DEPLOY_EVENT_TYPE }),
      },
    );
    // GitHub answers 204 No Content when the event is accepted.
    return dispatchResponse.status === 204 ? "started" : "failed";
  } catch {
    return "failed";
  }
}
