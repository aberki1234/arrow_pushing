/**
 * The editor's side of the development server's reaction-file requests
 * (editorFileServer/reactionFileRequests.ts), under /editor-api/reactions.
 */
export const REACTION_FILES_PATH = "/editor-api/reactions";

export interface ListedReactionFile {
  readonly fileName: string;
  readonly reactionSlug: string | null;
  readonly title: string | null;
}

export interface ReactionFileStore {
  list(): Promise<ListedReactionFile[]>;
  read(fileName: string): Promise<Record<string, unknown>>;
  save(fileName: string, document: Readonly<Record<string, unknown>>): Promise<void>;
}

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
