<script lang="ts">
  // A reaction as the cards show it (decided 2026-11-26, item 11): the start state's species
  // with "+" between them, an arrow with the conditions above and below, then the product or a
  // "?" box. The drawing is worked out in src/drawing/moleculeDrawing/schemeDrawing.ts (RSC / ACS
  // document style); this only renders it.
  import type {
    CatalogueAbbreviatedGroup,
    SchemeState,
  } from "../../core/catalogue/catalogueReading.js";
  import {
    SCHEME_FONT_SIZE,
    SCHEME_LINE_WIDTH,
    SCRIPT_SIZE,
    type SchemeDrawing,
    type TextRun,
    conditionsLabelParts,
    drawSchemeState,
    textRunShifts,
    textRuns,
  } from "../../drawing/moleculeDrawing/schemeDrawing.js";

  const {
    startState,
    productState,
    conditionsLabel,
    abbreviatedGroups = [],
  }: {
    startState: SchemeState;
    /** null: the product is hidden behind a "?" box. */
    productState: SchemeState | null;
    conditionsLabel?: string | undefined;
    abbreviatedGroups?: readonly CatalogueAbbreviatedGroup[];
  } = $props();

  /** The drawing, or no species when the state cannot be read (the card still shows). */
  function drawingOf(state: SchemeState): SchemeDrawing {
    try {
      return drawSchemeState(state, abbreviatedGroups);
    } catch {
      return { species: [] };
    }
  }

  const startDrawing = $derived(drawingOf(startState));
  const productDrawing = $derived(productState === null ? null : drawingOf(productState));
  const conditions = $derived(conditionsLabelParts(conditionsLabel));

  function scriptSize(run: TextRun): string | undefined {
    return run.position === "normal" ? undefined : `${String(SCRIPT_SIZE * 100)}%`;
  }
</script>

{#snippet richText(text: string)}
  {#each textRuns(text) as run, position (position)}
    {#if run.position === "subscript"}<sub>
        {run.text}
      </sub>{:else if run.position === "superscript"}<sup>{run.text}</sup>{:else}{run.text}{/if}
  {/each}
{/snippet}

{#snippet speciesRow(drawing: SchemeDrawing)}
  {#each drawing.species as species, position (position)}
    {#if position > 0}<span class="scheme-plus">+</span>{/if}
    {@const box = species.viewBox}
    <svg
      class="scheme-species"
      viewBox={`${String(box.minX)} ${String(box.minY)} ${String(box.width)} ${String(box.height)}`}
      width={box.width}
      height={box.height}
      aria-hidden="true"
    >
      <g stroke-width={SCHEME_LINE_WIDTH}>
        {#each species.lines as line, linePosition (linePosition)}
          <line x1={line.start.x} y1={line.start.y} x2={line.end.x} y2={line.end.y} />
        {/each}
        {#each species.wedges as wedge, wedgePosition (wedgePosition)}
          {#if wedge.style === "wedge"}
            <polygon
              class="scheme-wedge"
              points={wedge.corners
                .map((corner) => `${String(corner.x)},${String(corner.y)}`)
                .join(" ")}
            />
          {:else}
            {#each wedge.hashes as hash, hashPosition (hashPosition)}
              <line x1={hash.start.x} y1={hash.start.y} x2={hash.end.x} y2={hash.end.y} />
            {/each}
          {/if}
        {/each}
      </g>
      {#each species.labels as label, labelPosition (labelPosition)}
        {@const shifts = textRunShifts(label.runs)}
        <text x={label.x} y={label.baselineY} font-size={SCHEME_FONT_SIZE}>
          {#each label.runs as run, runPosition (runPosition)}<tspan
              font-size={scriptSize(run)}
              dy={(shifts[runPosition] ?? 0) * SCHEME_FONT_SIZE}
            >
              {run.text}
            </tspan>{/each}
        </text>
      {/each}
    </svg>
  {/each}
{/snippet}

<div class="scheme">
  {@render speciesRow(startDrawing)}
  <div class="scheme-arrow">
    <span class="scheme-above">{@render richText(conditions.above)}</span>
    <span class="scheme-shaft"></span>
    <svg class="scheme-head" viewBox="0 0 9 8" aria-hidden="true">
      <path d="M9 4 L0 0.9 L1.6 4 L0 7.1 Z" />
    </svg>
    <span class="scheme-below">{@render richText(conditions.below)}</span>
  </div>
  {#if productDrawing === null}
    <span class="scheme-hidden" role="img" aria-label="Product hidden">?</span>
  {:else}
    {@render speciesRow(productDrawing)}
  {/if}
</div>
