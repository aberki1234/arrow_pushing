/**
 * The ArrowPush brand mark: one curved two-electron arrow with a full head on a rounded tile,
 * drawn on a 32-unit square. The site header (SiteHeader.svelte) draws it from these numbers,
 * and app/icons/favicon.svg repeats them (siteIcons.test.ts checks that the two agree).
 */

/** The mark's geometry, in units of its 32 × 32 view box. */
export interface BrandMarkGeometry {
  /** The side of the square view box. */
  readonly viewBoxSide: number;
  /** The tile's corner radius. */
  readonly tileCornerRadius: number;
  /** SVG path data of the arrow's curved shaft. */
  readonly arrowShaftPath: string;
  /** SVG points of the arrowhead triangle. */
  readonly arrowheadPoints: string;
  /** Stroke width of the shaft. */
  readonly arrowShaftWidth: number;
}

/** The mark chosen 2026-11-29 (option B of the icon options). */
export function brandMarkGeometry(): BrandMarkGeometry {
  return {
    viewBoxSide: 32,
    tileCornerRadius: 7,
    // Rises from the lower left, arches over and comes down vertically into the head.
    arrowShaftPath: "M8 24 C8 9 23 8 23 16",
    // A triangle pointing straight down, its base centred on the shaft's end.
    arrowheadPoints: "18.2,15 27.8,15 23,23",
    arrowShaftWidth: 3.6,
  };
}
