/**
 * Fill a new database from reaction files (docs/SPEC.md §5, backend, "Content"): the four example
 * reactions become published version 1, the drafts in content/reactions/ drafts. A slug already
 * in the database is skipped, so the import can run again safely.
 *
 * A file to publish is linted before anything is saved, so one with lint errors stops the import
 * without leaving a draft behind.
 */
import { readFileSync } from "node:fs";
import type { LintFinding } from "../../tooling/reactionLinting/lintFindings.js";
import type { ReactionDatabase } from "./databaseTables.js";
import { publishDraft } from "./publishing.js";
import { ReactionDatabaseError } from "./reactionDatabaseErrors.js";
import { findReaction, saveDraft } from "./reactionVersions.js";

export interface ReactionFileImport {
  /** Files to publish as version 1 (they must lint without errors). */
  readonly publishedFilePaths: readonly string[];
  /** Files to store as drafts, lint findings or not. */
  readonly draftFilePaths: readonly string[];
  /** The owner: author and publisher of everything imported; agrees the licence. */
  readonly ownerUserId: string;
  readonly lintDocument: (reactionDocument: Readonly<Record<string, unknown>>) => LintFinding[];
}

export interface ImportSummary {
  readonly publishedSlugs: string[];
  readonly draftSlugs: string[];
  /** Slugs already in the database, left as they were. */
  readonly skippedSlugs: string[];
}

function readReactionDocument(filePath: string): {
  slug: string;
  document: Record<string, unknown>;
} {
  const document: unknown = JSON.parse(readFileSync(filePath, "utf-8"));
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    throw new Error(`${filePath} does not hold a JSON object`);
  }
  const slug = (document as Record<string, unknown>).reactionSlug;
  if (typeof slug !== "string" || slug === "") {
    throw new ReactionDatabaseError("document-has-no-slug", `${filePath} has no reactionSlug`);
  }
  return { slug, document: document as Record<string, unknown> };
}

async function importPublished(
  database: ReactionDatabase,
  fileImport: ReactionFileImport,
  filePath: string,
): Promise<void> {
  const { slug, document } = readReactionDocument(filePath);
  const lintFindings = fileImport.lintDocument(document);
  if (lintFindings.some((finding) => finding.lintLevel === "error")) {
    throw new ReactionDatabaseError(
      "draft-has-lint-errors",
      `${filePath} ("${slug}") has lint errors and is not published`,
      lintFindings,
    );
  }
  await saveDraft(database, document, fileImport.ownerUserId);
  await publishDraft(database, {
    reactionSlug: slug,
    publisherUserId: fileImport.ownerUserId,
    licenceAgreedNow: true,
    lintDocument: fileImport.lintDocument,
  });
}

/** Import the files in the order given, published files first. */
export async function importReactionFiles(
  database: ReactionDatabase,
  fileImport: ReactionFileImport,
): Promise<ImportSummary> {
  const summary: ImportSummary = { publishedSlugs: [], draftSlugs: [], skippedSlugs: [] };
  const filesWithTheirList: [string, string[]][] = [
    ...fileImport.publishedFilePaths.map((filePath): [string, string[]] => [
      filePath,
      summary.publishedSlugs,
    ]),
    ...fileImport.draftFilePaths.map((filePath): [string, string[]] => [
      filePath,
      summary.draftSlugs,
    ]),
  ];
  for (const [filePath, importedSlugs] of filesWithTheirList) {
    const { slug, document } = readReactionDocument(filePath);
    if ((await findReaction(database, slug)) !== undefined) {
      summary.skippedSlugs.push(slug);
    } else if (importedSlugs === summary.publishedSlugs) {
      await importPublished(database, fileImport, filePath);
      importedSlugs.push(slug);
    } else {
      await saveDraft(database, document, fileImport.ownerUserId);
      importedSlugs.push(slug);
    }
  }
  return summary;
}
