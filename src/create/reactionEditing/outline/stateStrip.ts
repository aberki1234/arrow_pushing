/**
 * Create's row of state thumbnails under the drawing (docs/SPEC.md §5, "Create", stage 2), and
 * the names states are shown by.
 *
 * Rows
 *   The first row is the route: the start state and the preferred route from it. Each other
 *   step leaving a state starts a branch row, which names the state it leaves and the state it
 *   joins. States no route reaches come last, in an "unconnected" row. Built from the mechanism
 *   outline (mechanismOutline.ts), so the order is the mechanism panel's.
 *
 * Names
 *   "Start" for the start state, "Product" for the state where the preferred route ends and "Other
 *   product" for any other state no step leaves (once there are steps), and
 *   "Intermediate N" for the others, numbered in the order the rows show them.
 */
import { mechanismOutline, type OutlineRow } from "./mechanismOutline.js";
import { type ReactionDocument, stepsOf } from "../draft/reactionDraft.js";

export type StripFrame =
  | { readonly frameKind: "state"; readonly stateId: string }
  | { readonly frameKind: "step"; readonly stepKey: string; readonly stepKind: string };

export interface StateStripRow {
  readonly rowKind: "route" | "branch" | "unconnected";
  /** How far the row is indented (0 for the route; a branch of a branch is 2). */
  readonly depth: number;
  /** A branch's: the state its first step leaves. */
  readonly leavesStateId: string | null;
  readonly frames: readonly StripFrame[];
  /** A branch's: the state shown elsewhere that it reaches. */
  readonly joinsStateId: string | null;
}

interface StripBuilding {
  readonly rows: { -readonly [Key in keyof StateStripRow]: StateStripRow[Key] }[];
  /** The row still taking frames at each depth (a branch's closes at its join). */
  readonly openRowAtDepth: Map<number, StripBuilding["rows"][number]>;
  /** The state last shown at each depth: a branch starting one level deeper leaves it. */
  readonly lastStateAtDepth: Map<number, string>;
  readonly stepKeyToKind: ReadonlyMap<string, string>;
}

function newRow(
  rowKind: StateStripRow["rowKind"],
  depth: number,
  leavesStateId: string | null,
): StripBuilding["rows"][number] {
  return { rowKind, depth, leavesStateId, frames: [], joinsStateId: null };
}

/** The open row at `depth`, starting a branch from the state last shown one level up if none. */
function openRow(building: StripBuilding, depth: number): StripBuilding["rows"][number] {
  const open = building.openRowAtDepth.get(depth);
  if (open !== undefined) {
    return open;
  }
  const branch = newRow("branch", depth, building.lastStateAtDepth.get(depth - 1) ?? null);
  building.rows.push(branch);
  building.openRowAtDepth.set(depth, branch);
  return branch;
}

/** A state of the main column comes right after its step; any other is not connected. */
function addStateRow(
  building: StripBuilding,
  row: OutlineRow & { rowKind: "state" },
  previous: OutlineRow | undefined,
): void {
  const connected =
    previous === undefined || (previous.rowKind === "step" && previous.depth === row.depth);
  const frame = { frameKind: "state", stateId: row.stateId } as const;
  if (connected) {
    const open = openRow(building, row.depth);
    open.frames = [...open.frames, frame];
    building.lastStateAtDepth.set(row.depth, row.stateId);
    return;
  }
  let unconnected = building.rows.find((built) => built.rowKind === "unconnected");
  if (unconnected === undefined) {
    unconnected = newRow("unconnected", 0, null);
    building.rows.push(unconnected);
  }
  unconnected.frames = [...unconnected.frames, frame];
}

function addOutlineRow(
  building: StripBuilding,
  row: OutlineRow,
  previous: OutlineRow | undefined,
): void {
  if (row.rowKind === "state") {
    addStateRow(building, row, previous);
    return;
  }
  const open = openRow(building, row.depth);
  if (row.rowKind === "join") {
    open.joinsStateId = row.stateId;
    building.openRowAtDepth.delete(row.depth);
    return;
  }
  const stepKind = building.stepKeyToKind.get(row.stepKey) ?? "";
  open.frames = [...open.frames, { frameKind: "step", stepKey: row.stepKey, stepKind }];
}

export function stateStripRows(document: ReactionDocument): StateStripRow[] {
  const route = newRow("route", 0, null);
  const building: StripBuilding = {
    rows: [route],
    openRowAtDepth: new Map([[0, route]]),
    lastStateAtDepth: new Map(),
    stepKeyToKind: new Map(
      stepsOf(document).map((step) => [String(step.stepKey), String(step.stepKind)]),
    ),
  };
  const outlineRows = mechanismOutline(document);
  outlineRows.forEach((row, position) => {
    addOutlineRow(building, row, outlineRows[position - 1]);
  });
  return building.rows;
}

/** Where following the preferred steps from the start state stops. */
function endOfPreferredRoute(document: ReactionDocument): string {
  const steps = stepsOf(document);
  const passed = new Set<string>();
  let stateId = String(document.startStateId);
  for (;;) {
    passed.add(stateId);
    const preferred = steps.find(
      (step) => step.fromStateId === stateId && step.routePreference === "preferred",
    );
    const nextStateId = preferred === undefined ? undefined : String(preferred.toStateId);
    if (nextStateId === undefined || passed.has(nextStateId)) {
      return stateId;
    }
    stateId = nextStateId;
  }
}

/** Product states (no step leaves them) in strip order, the main product first. */
function productsMainFirst(document: ReactionDocument, stateIdsInOrder: string[]): string[] {
  const steps = stepsOf(document);
  if (steps.length === 0) {
    return [];
  }
  const products = stateIdsInOrder.filter(
    (stateId) =>
      stateId !== document.startStateId && !steps.some((step) => step.fromStateId === stateId),
  );
  const mainProduct = endOfPreferredRoute(document);
  return products.includes(mainProduct)
    ? [mainProduct, ...products.filter((stateId) => stateId !== mainProduct)]
    : products;
}

/**
 * stateId -> its shown name, for every state of the document: "Product" for the main product
 * (where the preferred route ends), "Other product" (numbered when several) for the others.
 */
export function stateDisplayNames(document: ReactionDocument): ReadonlyMap<string, string> {
  const stateIdsInOrder = stateStripRows(document).flatMap((row) =>
    row.frames.flatMap((frame) => (frame.frameKind === "state" ? [frame.stateId] : [])),
  );
  const [mainProduct, ...otherProducts] = productsMainFirst(document, stateIdsInOrder);
  const stateIdToName = new Map<string, string>();
  let intermediateCount = 0;
  for (const stateId of stateIdsInOrder) {
    const otherPosition = otherProducts.indexOf(stateId);
    if (stateId === document.startStateId) {
      stateIdToName.set(stateId, "Start");
    } else if (stateId === mainProduct) {
      stateIdToName.set(stateId, "Product");
    } else if (otherPosition >= 0) {
      const number = otherProducts.length > 1 ? ` ${String(otherPosition + 1)}` : "";
      stateIdToName.set(stateId, `Other product${number}`);
    } else {
      intermediateCount += 1;
      stateIdToName.set(stateId, `Intermediate ${String(intermediateCount)}`);
    }
  }
  return stateIdToName;
}
