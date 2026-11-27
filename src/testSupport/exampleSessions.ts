/** Example reactions read as session reactions, for the step session tests. */
import { exampleReactionFile } from "./exampleReactionFiles.js";
import {
  type SessionReaction,
  readSessionReaction,
} from "../learner/stepSession/sessionReaction.js";

export function exampleSessionReaction(reactionSlug: string): SessionReaction {
  return readSessionReaction(exampleReactionFile(`${reactionSlug}.json`));
}
