// The reaction editor (src/reactionEditor). `make editor`: Vite's development server, where the
// plugin below passes /editor-api/reactions requests to the reaction-file handler
// (src/editorFileServer), which reads and writes content/reactions/. `make editor-build`: the
// editor built into build/editor/, which the backend serves (it then saves to the database). It
// is never part of the learner site.
import type { IncomingMessage } from "node:http";
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Plugin } from "vite";
import { handleReactionFileRequest } from "./src/editorFileServer/reactionFileRequests.js";
import { REACTION_FILES_PATH } from "./src/reactionEditor/reactionFileStore.js";

function fromProjectRoot(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

const CONTENT_FOLDER = fromProjectRoot("content/reactions/");
const EDITOR_PORT = 5174;

function requestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });
    request.on("error", reject);
  });
}

function reactionFilesPlugin(): Plugin {
  return {
    name: "reaction-files",
    configureServer(server): void {
      server.middlewares.use(REACTION_FILES_PATH, (request, response) => {
        void requestBody(request).then((body) => {
          const path = (request.url ?? "/").split("?")[0] ?? "/";
          const answer = handleReactionFileRequest(
            { method: request.method ?? "GET", path, body },
            CONTENT_FOLDER,
          );
          response.statusCode = answer.status;
          response.setHeader("Content-Type", answer.contentType);
          response.end(answer.body);
        });
      });
    },
  };
}

export default defineConfig({
  root: fromProjectRoot("src/reactionEditor/"),
  server: { port: EDITOR_PORT },
  build: { outDir: fromProjectRoot("build/editor/"), emptyOutDir: true },
  // Ketcher, the structure editor (item 10h): fetched by `make ketcher` into vendor/editor-public/
  // ketcher (not in git) and served, and copied into the build, at /ketcher/.
  publicDir: fromProjectRoot("vendor/editor-public/"),
  // The lint worker is a module worker (main.ts starts it with type "module").
  worker: { format: "es" },
  // RDKit.js is a CommonJS (Emscripten) module: Vite pre-bundles it into an ES module, and
  // main.ts passes the URL of its .wasm file, so it need not be found beside the script.
  plugins: [svelte({ configFile: false }), reactionFilesPlugin()],
});
