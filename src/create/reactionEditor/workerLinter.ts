/**
 * The page's side of live lint: each draft is posted to the lint worker (lintWorker.ts) with an
 * id, and the promise for it resolves with the answer carrying that id. Lint runs in a worker so
 * that drawing never waits for it.
 */
import type { LintAnswer, LintRequest } from "./lintRequests.js";
import type { LintFinding } from "../../tooling/reactionLinting/lintFindings.js";
import type { ReactionDocument } from "../reactionEditing/draft/reactionDraft.js";

/** The part of a Worker used here (a test passes a fake one). */
export interface LintWorkerPort {
  onmessage: ((event: { data: LintAnswer }) => void) | null;
  postMessage(request: LintRequest): void;
}

export type DraftLinter = (document: ReactionDocument) => Promise<readonly LintFinding[]>;

export function workerLinter(worker: LintWorkerPort): DraftLinter {
  const waiting = new Map<number, (findings: readonly LintFinding[]) => void>();
  let lastRequestId = 0;
  worker.onmessage = ({ data }): void => {
    waiting.get(data.requestId)?.(data.lintFindings);
    waiting.delete(data.requestId);
  };
  return (document) => {
    lastRequestId += 1;
    const requestId = lastRequestId;
    return new Promise((resolve) => {
      waiting.set(requestId, resolve);
      worker.postMessage({ requestId, document });
    });
  };
}

/** A browser Worker as the port above. */
export function browserWorkerPort(worker: Worker): LintWorkerPort {
  const port: LintWorkerPort = {
    onmessage: null,
    postMessage: (request) => {
      worker.postMessage(request);
    },
  };
  worker.onmessage = (event: MessageEvent<LintAnswer>): void => {
    port.onmessage?.({ data: event.data });
  };
  return port;
}
