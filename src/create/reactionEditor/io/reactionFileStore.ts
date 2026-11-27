/**
 * The development server's adapter for ReactionFileStore (model/reactionFileStoreInterface.ts):
 * the reaction files in content/reactions/, over HTTP (editorFileServer/reactionFileRequests.ts,
 * under /editor-api/reactions; `make editor`). The built editor's adapter is
 * serverReactionStore.ts.
 */
import type { ListedReactionFile, ReactionFileStore } from "../model/reactionFileStoreInterface.js";

export const REACTION_FILES_PATH = "/editor-api/reactions";

async function answerOf(response: Response): Promise<unknown> {
  const body: unknown = await response.json();
  if (!response.ok) {
    const error =
      typeof body === "object" && body !== null && "error" in body ? String(body.error) : "";
    throw new Error(error || `the file server answered ${String(response.status)}`);
  }
  return body;
}

/** The store over HTTP; `fetchFunction` is the browser's fetch unless a test passes another. */
export function httpReactionFileStore(fetchFunction: typeof fetch = fetch): ReactionFileStore {
  return {
    storagePlace: "content/reactions/",
    list: async (): Promise<ListedReactionFile[]> =>
      (await answerOf(await fetchFunction(`${REACTION_FILES_PATH}/`))) as ListedReactionFile[],
    read: async (fileName): Promise<Record<string, unknown>> =>
      (await answerOf(await fetchFunction(`${REACTION_FILES_PATH}/${fileName}`))) as Record<
        string,
        unknown
      >,
    save: async (fileName, document): Promise<void> => {
      await answerOf(
        await fetchFunction(`${REACTION_FILES_PATH}/${fileName}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(document),
        }),
      );
    },
  };
}
