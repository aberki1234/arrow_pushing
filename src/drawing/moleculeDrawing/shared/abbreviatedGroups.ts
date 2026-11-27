/**
 * Which atoms of a state are drawn, labelled or tappable once spectators and abbreviated groups
 * are taken into account (docs/schema-design.md section 3.1; decided 2026-11-25).
 *
 * Terms
 *   abbreviated group  Bystander atoms drawn as one short label ("Ph") at the attachment atom,
 *                      wherever all of them are present and they hang off the rest by exactly one
 *                      bond from the attachment atom ("intact"). Elsewhere they are drawn in full.
 *   untappable atom    A spectator, or any atom of an intact group: no pick target is made for it,
 *                      for its electrons, or for a bond that touches it.
 */
import { type StateGraph, bondKeyMapNumbers } from "../../../core/stateGraphs/stateGraph.js";

export interface AbbreviatedGroup {
  readonly groupLabel: string;
  readonly attachmentMapNumber: number;
  readonly mapNumbers: readonly number[];
}

export interface StateDisplayPlan {
  readonly spectatorMapNumbers: ReadonlySet<number>;
  /** Atoms of intact groups other than their attachment atoms: not drawn at all. */
  readonly hiddenMapNumbers: ReadonlySet<number>;
  /** The attachment atom of each intact group, to the label drawn in its place. */
  readonly mapNumberToGroupLabel: ReadonlyMap<number, string>;
  readonly untappableMapNumbers: ReadonlySet<number>;
}

/** True when every atom of the group is in the state and one bond, from its attachment atom,
 * joins it to the rest. */
export function isGroupIntact(graph: StateGraph, group: AbbreviatedGroup): boolean {
  const members = new Set(group.mapNumbers);
  if (!group.mapNumbers.every((mapNumber) => graph.mapNumberToAtom.has(mapNumber))) {
    return false;
  }
  const leavingBonds = [...graph.bondToOrder.keys()]
    .map(bondKeyMapNumbers)
    .filter(([first, second]) => members.has(first) !== members.has(second));
  const [onlyBond] = leavingBonds;
  return leavingBonds.length === 1 && onlyBond?.includes(group.attachmentMapNumber) === true;
}

export function stateDisplayPlan(
  graph: StateGraph,
  spectatorMapNumbers: readonly number[],
  abbreviatedGroups: readonly AbbreviatedGroup[],
): StateDisplayPlan {
  const hiddenMapNumbers = new Set<number>();
  const mapNumberToGroupLabel = new Map<number, string>();
  const untappableMapNumbers = new Set(spectatorMapNumbers);
  for (const group of abbreviatedGroups.filter((candidate) => isGroupIntact(graph, candidate))) {
    mapNumberToGroupLabel.set(group.attachmentMapNumber, group.groupLabel);
    for (const mapNumber of group.mapNumbers) {
      untappableMapNumbers.add(mapNumber);
      if (mapNumber !== group.attachmentMapNumber) {
        hiddenMapNumbers.add(mapNumber);
      }
    }
  }
  return {
    spectatorMapNumbers: new Set(spectatorMapNumbers),
    hiddenMapNumbers,
    mapNumberToGroupLabel,
    untappableMapNumbers,
  };
}
