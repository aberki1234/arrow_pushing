/**
 * The editor's development server for reaction files (docs/SPEC.md §5, editor decisions
 * 2026-11-25): until the backend (8c), drafts live in content/reactions/ and the editor lists,
 * reads and saves them here. The Vite plugin in vite.editor.config.ts passes each request under
 * /editor-api/reactions to handleReactionFileRequest(); it runs only with `make editor`.
 *
 * Requests (paths relative to /editor-api/reactions)
 *   GET  /              [{fileName, reactionSlug, title, creationProgress}] for every .json file,
 *                       by name (all but the name null when the file is not a readable JSON
 *                       object; creationProgress from
 * reactionEditing/publishing/creationProgress.ts)
 *   GET  /<name>.json   the parsed file; 404 if it is not there
 *   PUT  /<name>.json   save the body (a JSON object) as 2-space JSON; creates the folder
 * A name is a slug ("sn2-test.json"), so no path can leave the folder (400 otherwise). Other
 * methods answer 405. Every answer is JSON; an error is {"error": message}.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { creationProgress } from "../reactionEditing/publishing/creationProgress.js";

export interface FileRequest {
  readonly method: string;
  /** The request path below /editor-api/reactions, e.g. "/sn2-test.json" ("" or "/" lists). */
  readonly path: string;
  readonly body: string;
}

export interface FileResponse {
  readonly status: number;
  readonly contentType: "application/json";
  readonly body: string;
}

const FILE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/;

function answer(status: number, value: unknown): FileResponse {
  return { status, contentType: "application/json", body: JSON.stringify(value) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsedObject(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function listing(folder: string): FileResponse {
  if (!existsSync(folder)) {
    return answer(200, []);
  }
  const fileNames = readdirSync(folder)
    .filter((name) => name.endsWith(".json"))
    .sort();
  return answer(
    200,
    fileNames.map((fileName) => {
      const document = parsedObject(readFileSync(join(folder, fileName), "utf-8"));
      const textOrNull = (value: unknown): string | null =>
        typeof value === "string" ? value : null;
      return {
        fileName,
        reactionSlug: textOrNull(document?.reactionSlug),
        title: textOrNull(document?.title),
        creationProgress: document === undefined ? null : creationProgress(document),
      };
    }),
  );
}

function fileRequest(request: FileRequest, folder: string, fileName: string): FileResponse {
  const filePath = join(folder, fileName);
  if (request.method === "GET") {
    return existsSync(filePath)
      ? answer(200, JSON.parse(readFileSync(filePath, "utf-8")))
      : answer(404, { error: `no file ${fileName}` });
  }
  if (request.method === "PUT") {
    const document = parsedObject(request.body);
    if (document === undefined) {
      return answer(400, { error: "the body must be a JSON object" });
    }
    mkdirSync(folder, { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf-8");
    return answer(200, { savedFileName: fileName });
  }
  return answer(405, { error: `${request.method} is not used here` });
}

/** Answer one request for the reaction files in `folder` (see the module comment). */
export function handleReactionFileRequest(request: FileRequest, folder: string): FileResponse {
  const name = request.path.replace(/^\//, "");
  if (name === "") {
    return request.method === "GET"
      ? listing(folder)
      : answer(405, { error: `${request.method} is not used here` });
  }
  if (!FILE_NAME_PATTERN.test(name)) {
    return answer(400, { error: `"${name}" is not a reaction file name (a slug, then .json)` });
  }
  return fileRequest(request, folder, name);
}
