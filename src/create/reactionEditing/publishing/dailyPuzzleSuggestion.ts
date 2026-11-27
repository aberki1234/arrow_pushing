/**
 * Whether Create suggests a reaction for the daily puzzle (docs/SPEC.md §1, the owner's rule of
 * 2026-11-26); the author may choose otherwise.
 *
 * Rule
 *   Suggested only if some step's canonical arrows form or break a σ bond other than an acidic
 *   X–H bond (X = O, N, S or a halogen): a σ bond between two heavier atoms, or an H bonded to
 *   anything else (C–H, B–H: a hydride transfer, a carbon acid, a radical abstraction).
 *   Resonance (only π bonds and lone pairs move) and plain proton transfers are left to practice
 *   and Learn. Arrows that cannot be read are skipped (the linter reports them).
 */
import {
  type ElectronLocus,
  parseCurvedArrow,
} from "../../../core/arrowNotation/curvedArrowNotation.js";
import { type ReactionDocument, stepsOf } from "../draft/reactionDraft.js";

/** Atoms whose bond to H is an acidic X–H: making or breaking it is a proton transfer. */
const ACIDIC_HYDROGEN_PARTNERS = new Set(["O", "N", "S", "F", "Cl", "Br", "I"]);

function isRealBond(locus: ElectronLocus): boolean {
  if (locus.locusKind !== "sigmaBond") {
    return false;
  }
  const [first, second] = locus.atoms.map((atom) => atom.element);
  if (first !== "H" && second !== "H") {
    return true;
  }
  const partner = first === "H" ? second : first;
  return partner === undefined || !ACIDIC_HYDROGEN_PARTNERS.has(partner);
}

function makesOrBreaksRealBond(arrowText: unknown): boolean {
  try {
    const { source, destination } = parseCurvedArrow(String(arrowText));
    return isRealBond(source) || isRealBond(destination);
  } catch {
    return false;
  }
}

export function suggestedDailyPuzzleEligible(document: ReactionDocument): boolean {
  return stepsOf(document).some(
    (step) =>
      Array.isArray(step.canonicalArrows) && step.canonicalArrows.some(makesOrBreaksRealBond),
  );
}
