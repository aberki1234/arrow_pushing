/**
 * The text drawn for an atom: every heavy atom is labelled in v1 (decided 2026-11-25), with its
 * implicit hydrogens and its formal charge, e.g. CH₃, OH⁻, H₂O, P⁺.
 *
 * Implicit hydrogens go on the side away from the atom's bonds ("OH" when the bond leaves to the
 * left, "HO" when it leaves to the right); a drawn (mapped) hydrogen is its own atom labelled "H".
 */
export type HydrogenSide = "left" | "right";

export interface AtomLabelText {
  readonly element: string;
  /** "", "H", "H₂", "H₃", … */
  readonly hydrogenText: string;
  readonly hydrogenSide: HydrogenSide;
  /** "", "+", "−", "2+", "2−", … (U+2212 minus sign) */
  readonly chargeText: string;
}

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";
const MINUS_SIGN = "\u2212";
// Bonds leaving to the right by more than this (sum of cosines) push the hydrogens to the left.
const RIGHTWARD_BOND_THRESHOLD = 0.1;

function subscriptOf(count: number): string {
  return String(count).replace(/[0-9]/g, (digit) => SUBSCRIPT_DIGITS[Number(digit)] ?? digit);
}

function chargeTextOf(formalCharge: number): string {
  if (formalCharge === 0) {
    return "";
  }
  const sign = formalCharge > 0 ? "+" : MINUS_SIGN;
  return Math.abs(formalCharge) === 1 ? sign : `${String(Math.abs(formalCharge))}${sign}`;
}

/** `bondAngles` are the directions (radians, screen axes) from the atom to its neighbours. */
export function atomLabelText(
  element: string,
  hydrogenCount: number,
  formalCharge: number,
  bondAngles: readonly number[],
): AtomLabelText {
  const rightwardPull = bondAngles.reduce((sum, angle) => sum + Math.cos(angle), 0);
  let hydrogenText = "";
  if (hydrogenCount > 0) {
    hydrogenText = hydrogenCount === 1 ? "H" : `H${subscriptOf(hydrogenCount)}`;
  }
  return {
    element,
    hydrogenText,
    hydrogenSide: rightwardPull > RIGHTWARD_BOND_THRESHOLD ? "left" : "right",
    chargeText: chargeTextOf(formalCharge),
  };
}

/** The label as one line of plain text, e.g. "OH−" or "H₂N", for accessible names and tests. */
export function plainLabel(labelText: AtomLabelText): string {
  const { element, hydrogenText, hydrogenSide, chargeText } = labelText;
  return hydrogenSide === "left"
    ? `${hydrogenText}${element}${chargeText}`
    : `${element}${hydrogenText}${chargeText}`;
}
