/**
 * The text drawn for an atom: every heavy atom is labelled in v1 (decided 2026-11-25), with its
 * implicit hydrogens and its formal charge, e.g. CH₃, OH⁻, H₂O, P⁺.
 *
 * Implicit hydrogens go beside the element, on the right ("OH") or else the left ("HO"), when that
 * side is at least SIDE_CLEARANCE from every bond; otherwise above or below it, whichever of the
 * four sides is furthest from the bonds (a CH₂ in a zigzag chain gets its H₂ below). A drawn
 * (mapped) hydrogen is its own atom labelled "H".
 */
export type HydrogenSide = "left" | "right" | "above" | "below";

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
/** How far (radians) a side must be from every bond for the hydrogens to go there. */
const SIDE_CLEARANCE = (50 * Math.PI) / 180;
// The sides in order of preference, with their screen directions (y down).
const SIDE_TO_ANGLE: readonly (readonly [HydrogenSide, number])[] = [
  ["right", 0],
  ["left", Math.PI],
  ["below", Math.PI / 2],
  ["above", -Math.PI / 2],
];

/** The smallest angle between `direction` and any of `bondAngles` (π when there are none). */
function clearanceOf(direction: number, bondAngles: readonly number[]): number {
  return bondAngles.reduce(
    (smallest, angle) =>
      Math.min(
        smallest,
        Math.abs(Math.atan2(Math.sin(angle - direction), Math.cos(angle - direction))),
      ),
    Math.PI,
  );
}

function hydrogenSideFor(bondAngles: readonly number[]): HydrogenSide {
  for (const [side, angle] of SIDE_TO_ANGLE.slice(0, 2)) {
    if (clearanceOf(angle, bondAngles) >= SIDE_CLEARANCE) {
      return side;
    }
  }
  let best: readonly [HydrogenSide, number] = ["right", -1];
  for (const [side, angle] of SIDE_TO_ANGLE) {
    const clearance = clearanceOf(angle, bondAngles);
    if (clearance > best[1] + 1e-9) {
      best = [side, clearance];
    }
  }
  return best[0];
}

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
  let hydrogenText = "";
  if (hydrogenCount > 0) {
    hydrogenText = hydrogenCount === 1 ? "H" : `H${subscriptOf(hydrogenCount)}`;
  }
  return {
    element,
    hydrogenText,
    hydrogenSide: hydrogenSideFor(bondAngles),
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
