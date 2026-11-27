/**
 * Plain words for a curved arrow in the learner's arrow list and in screen-reader messages,
 * e.g. "lone pair on O1 → new bond O1–C2", "π bond C3=C5 → new bond C3–C9".
 */
import type { CurvedArrow, ElectronLocus } from "../../core/arrowNotation/curvedArrowNotation.js";

function atomNames(locus: ElectronLocus): string[] {
  return locus.atoms.map((atom) => `${atom.element}${String(atom.mapNumber)}`);
}

export function describeSourceLocus(source: ElectronLocus): string {
  const [first = "", second = ""] = atomNames(source);
  switch (source.locusKind) {
    case "lonePair":
      return `lone pair on ${first}`;
    case "unpairedElectron":
      return `unpaired electron on ${first}`;
    case "sigmaBond":
      return `bond ${first}–${second}`;
    case "piBond":
      return `π bond ${first}=${second}`;
  }
}

export function describeDestinationLocus(destination: ElectronLocus): string {
  const [first = "", second = ""] = atomNames(destination);
  switch (destination.locusKind) {
    case "lonePair":
      return `lone pair on ${first}`;
    case "unpairedElectron":
      return `unpaired electron on ${first}`;
    case "sigmaBond":
      return `new bond ${first}–${second}`;
    case "piBond":
      return `new π bond ${first}=${second}`;
  }
}

export function describeCurvedArrow(curvedArrow: CurvedArrow): string {
  const arrowSign = curvedArrow.electronsMoved === 2 ? "→" : "⇀";
  return (
    `${describeSourceLocus(curvedArrow.source)} ${arrowSign} ` +
    describeDestinationLocus(curvedArrow.destination)
  );
}
