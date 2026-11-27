/**
 * The interface of where Create keeps reactions, and what a listing holds. Two adapters satisfy
 * it: io/reactionFileStore.ts (the development server's reaction files) and
 * io/serverReactionStore.ts (the backend's database). Both name a reaction by its file name,
 * "<slug>.json".
 */
import type { CreationProgress } from "../../reactionEditing/publishing/creationProgress.js";

export interface ListedReactionFile {
  readonly fileName: string;
  readonly reactionSlug: string | null;
  readonly title: string | null;
  /** The server's only: the newest version's number and submission status. */
  readonly newestReactionVersion?: number;
  readonly newestSubmissionStatus?: string;
  /** The server's only: whose reaction it is, and who wrote its newest version. */
  readonly ownerUserId?: string;
  readonly ownerName?: string;
  readonly newestAuthorUserId?: string;
  readonly newestAuthorName?: string;
  /** How far the draft has come in Create; null for a file that is not a reaction. */
  readonly creationProgress: CreationProgress | null;
}

export interface ReactionFileStore {
  /** Where saved reactions go, for messages: "content/reactions/" or "the server". */
  readonly storagePlace: string;
  list(): Promise<ListedReactionFile[]>;
  read(fileName: string): Promise<Record<string, unknown>>;
  save(fileName: string, document: Readonly<Record<string, unknown>>): Promise<void>;
}
