/**
 * A reaction version ref, "<reactionSlug>@<reactionVersion>" ("aldol-addition-base@3"): how the
 * catalogue, learner progress and the daily calendar name one version of a reaction.
 */

export function reactionVersionRef(reactionSlug: string, reactionVersion: number): string {
  return `${reactionSlug}@${String(reactionVersion)}`;
}

/** The slug and version of a reaction version ref, "aldol@3" -> ["aldol", 3]. */
export function splitReactionVersionRef(
  ref: string,
): [reactionSlug: string, reactionVersion: number] {
  const at = ref.lastIndexOf("@");
  return [ref.slice(0, at), Number(ref.slice(at + 1))];
}
