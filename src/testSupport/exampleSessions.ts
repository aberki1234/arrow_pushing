/** Example reactions read as session reactions, for the step session tests. */
import { exampleReactionDocuments } from "./fixtureFiles.js";
import { type SessionReaction, readSessionReaction } from "../stepSession/sessionReaction.js";

export function exampleSessionReaction(reactionSlug: string): SessionReaction {
  const found = exampleReactionDocuments().find(([name]) => name === `${reactionSlug}.json`);
  if (found === undefined) {
    throw new Error(`no example reaction ${reactionSlug}`);
  }
  return readSessionReaction(found[1]);
}
