/**
 * An unfinished draft as a reaction file, for Play as learner and Create's drawings: its
 * mechanism (draftMechanism: always valid) with every Publish field the draft has filled in
 * correctly, and a placeholder for each one it has not. The placeholders live here, named, and
 * nowhere else: the learner site reads published files strictly.
 */
import { isRecord } from "../../../core/jsonValues/jsonValues.js";
import type {
  ReactionAuthor,
  ReactionClass,
  ReactionFile,
} from "../../../core/reactionFiles/reactionFile.js";
import { type ReactionDocument, draftMechanism } from "./reactionDraft.js";

/** What a preview shows for a Publish field the draft has not filled in. */
export const PREVIEW_PLACEHOLDERS = {
  reactionSlug: "draft",
  title: "Untitled draft",
  mechanismSummary: "No mechanism summary yet.",
} as const;

function textOr(value: unknown, placeholder: string): string {
  return typeof value === "string" && value !== "" ? value : placeholder;
}

function texts(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function versionOr(value: unknown, placeholder: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : placeholder;
}

function difficultyTierOf(value: unknown): 1 | 2 | 3 {
  return value === 2 || value === 3 ? value : 1;
}

function authorsOf(value: unknown): ReactionAuthor[] {
  return (Array.isArray(value) ? value : [])
    .filter(isRecord)
    .flatMap((author) =>
      typeof author["name"] === "string" && author["name"] !== ""
        ? [{ name: author["name"], url: typeof author["url"] === "string" ? author["url"] : null }]
        : [],
    );
}

export function previewReactionFile(document: ReactionDocument): ReactionFile {
  const mechanism = draftMechanism(document);
  const previous = document["previousReactionVersion"];
  const subtitle = document["subtitle"];
  return {
    ...mechanism,
    formatVersion: 1,
    reactionSlug: textOr(document["reactionSlug"], PREVIEW_PLACEHOLDERS.reactionSlug),
    reactionVersion: versionOr(document["reactionVersion"], 1),
    previousReactionVersion: typeof previous === "number" ? previous : null,
    title: textOr(document["title"], PREVIEW_PLACEHOLDERS.title),
    ...(typeof subtitle === "string" && subtitle !== "" ? { subtitle } : {}),
    // The editor offers only the schema's classes.
    reactionClasses: texts(document["reactionClasses"]) as ReactionClass[],
    difficultyTier: difficultyTierOf(document["difficultyTier"]),
    conditionsLabel: textOr(document["conditionsLabel"], ""),
    dailyPuzzleEligible: document["dailyPuzzleEligible"] === true,
    atomRoleToMapNumbers: mechanism.atomRoleToMapNumbers ?? {},
    spectatorMapNumbers: mechanism.spectatorMapNumbers ?? [],
    mechanismSummary: textOr(document["mechanismSummary"], PREVIEW_PLACEHOLDERS.mechanismSummary),
    references: texts(document["references"]),
    authors: authorsOf(document["authors"]),
    licence: "CC-BY-SA-4.0",
  };
}
