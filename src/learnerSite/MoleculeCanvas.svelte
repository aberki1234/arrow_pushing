<script lang="ts">
  // Renders one state drawing (moleculeDrawing/stateDrawing.ts) as SVG: bonds, atom labels,
  // electron dots, annotations, curved arrows, and the pick targets the learner taps or reaches
  // with Tab and Enter. With a source picked (`destinations`, point and snap: docs/SPEC.md §3,
  // item 10g) the place nearest the pointer is previewed as a ghost arrow, a new bond as a dashed
  // line, and a click picks it; on touch every possible new bond is drawn as a faint dashed line
  // and a tap picks the nearest place. Possible new bonds are keyboard targets too.
  // The editor may pass an `overlay` (its drag and show-H handles), drawn on top.
  import type { Snippet } from "svelte";
  import type { DrawnCurvedArrow } from "../moleculeDrawing/curvedArrowGeometry.js";
  import type { Point } from "../moleculeDrawing/planeGeometry.js";
  import type { PickTarget, StateDrawing } from "../moleculeDrawing/stateDrawing.js";
  import {
    type DestinationTarget,
    nearestDestinationTarget,
  } from "../stepSession/destinationTargets.js";

  const {
    drawing,
    arrows,
    interactive,
    selectedTargetId,
    destinations = null,
    onPick,
    overlay,
  }: {
    drawing: StateDrawing;
    arrows: readonly { drawn: DrawnCurvedArrow; arrowClass: string }[];
    interactive: boolean;
    selectedTargetId: string | null;
    /** Where the picked source's electrons can go; null with no source picked. */
    destinations?: readonly DestinationTarget[] | null;
    onPick: (target: PickTarget) => void;
    overlay?: Snippet;
  } = $props();

  // Drawing sizes, in pixels.
  const DOT_RADIUS = 2.3;
  const CANVAS_DESCRIPTION =
    "Molecule drawing. Tab to atoms, bonds and lone pairs; press Enter to choose a source, " +
    "then a target. Escape cancels.";

  const viewBox = $derived(
    [
      drawing.viewBox.minX,
      drawing.viewBox.minY,
      drawing.viewBox.width,
      drawing.viewBox.height,
    ].join(" "),
  );

  let svgElement: SVGSVGElement | undefined = $state();
  /** Set by the first touch on the drawing; a mouse or pen moving over it clears it. */
  let touchMode = $state(false);
  /** The place nearest the pointer, kept with the list it came from. */
  let hovered = $state.raw<{
    from: readonly DestinationTarget[];
    place: DestinationTarget;
  } | null>(null);
  const preview = $derived(
    hovered !== null && destinations !== null && hovered.from === destinations && !touchMode
      ? hovered.place
      : null,
  );
  const newBondPlaces = $derived(
    (destinations ?? []).filter((place) => place.newBondLine !== null),
  );

  /** The pointer in the drawing's own units; null where there is no layout (tests). */
  function drawingPoint(event: MouseEvent): Point | null {
    let matrix: DOMMatrix | null;
    try {
      matrix = svgElement?.getScreenCTM() ?? null;
    } catch {
      // jsdom (tests) has no getScreenCTM: no layout to measure against.
      return null;
    }
    if (matrix === null) {
      return null;
    }
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  /** The pick target of the element under a click, by its data-target-id. */
  function targetUnder(event: MouseEvent): PickTarget | null {
    const element =
      event.target instanceof Element ? event.target.closest("[data-target-id]") : null;
    const targetId = element?.getAttribute("data-target-id") ?? null;
    const all = [...drawing.pickTargets, ...newBondPlaces.map((place) => place.target)];
    return all.find((target) => target.pickTargetId === targetId) ?? null;
  }

  function onPointerDown(event: PointerEvent): void {
    touchMode = event.pointerType === "touch";
  }

  function onPointerMove(event: PointerEvent): void {
    if (destinations === null || event.pointerType === "touch") {
      return;
    }
    touchMode = false;
    const point = drawingPoint(event);
    const place = point === null ? null : nearestDestinationTarget(destinations, point);
    hovered = place === null ? null : { from: destinations, place };
  }

  /** With a source picked, a click (or tap) picks the nearest place, else what was clicked. */
  function onCanvasClick(event: MouseEvent): void {
    if (!interactive) {
      return;
    }
    const point = drawingPoint(event);
    const nearest =
      destinations === null || point === null
        ? null
        : nearestDestinationTarget(destinations, point);
    const target = nearest?.target ?? targetUnder(event);
    if (target !== null) {
      hovered = null;
      onPick(target);
    }
  }

  // Pointer and click listeners on the drawing itself (not markup handlers: the drawing is a
  // group, not a control; its controls are the pick targets).
  $effect(() => {
    const element = svgElement;
    if (element === undefined) {
      return undefined;
    }
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("click", onCanvasClick);
    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("click", onCanvasClick);
    };
  });

  function activate(event: KeyboardEvent, action: () => void): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  }
</script>

<!-- Drawn at the view box's own size (one bond = 56 px); site.css lets it shrink to fit. -->
<svg
  bind:this={svgElement}
  class="mol"
  {viewBox}
  width={drawing.viewBox.width}
  height={drawing.viewBox.height}
  overflow="visible"
  role="group"
  aria-label={CANVAS_DESCRIPTION}
>
  <defs>
    <marker
      id="arrowhead-pair"
      viewBox="0 0 10 10"
      refX="8"
      refY="5"
      markerWidth="5.5"
      markerHeight="5.5"
      orient="auto-start-reverse"
      markerUnits="strokeWidth"
    >
      <path
        d="M0,1 L9,5 L0,9 z"
        fill="context-stroke"
        stroke="context-stroke"
        stroke-linejoin="round"
      />
    </marker>
    <marker
      id="arrowhead-fish-hook"
      viewBox="0 0 10 10"
      refX="8"
      refY="5"
      markerWidth="5.5"
      markerHeight="5.5"
      orient="auto-start-reverse"
      markerUnits="strokeWidth"
    >
      <path
        d="M0,0.5 L9,5"
        fill="none"
        stroke="context-stroke"
        stroke-width="1.8"
        stroke-linecap="round"
      />
    </marker>
  </defs>

  <g aria-hidden="true">
    {#each drawing.bonds as bond (bond.mapNumbers.join("-"))}
      <g class:faded={bond.isSpectator}>
        {#if bond.bondLines.wedge !== null}
          <polygon
            class="bond wedge"
            class:dash={bond.bondLines.wedge.style === "dash"}
            points={bond.bondLines.wedge.corners
              .map((corner) => `${String(corner.x)},${String(corner.y)}`)
              .join(" ")}
          />
        {:else}
          {#each bond.bondLines.lines as line, position (position)}
            <line
              class="bond"
              x1={line.start.x}
              y1={line.start.y}
              x2={line.end.x}
              y2={line.end.y}
            />
          {/each}
        {/if}
      </g>
    {/each}

    {#each drawing.atoms as atom (atom.mapNumber)}
      <g class:faded={atom.isSpectator}>
        <text class="at elem" x={atom.point.x} y={atom.point.y} text-anchor="middle">
          {atom.labelText.element}
        </text>
        {#if atom.hydrogenTextPoint !== null}
          <text
            class="at h"
            x={atom.hydrogenTextPoint.x}
            y={atom.hydrogenTextPoint.y}
            text-anchor={atom.hydrogenTextAnchor}
          >
            {atom.labelText.hydrogenText}
          </text>
        {/if}
        {#if atom.chargePoint !== null}
          <text class="at chg" x={atom.chargePoint.x} y={atom.chargePoint.y} text-anchor="start">
            {atom.labelText.chargeText}
          </text>
        {/if}
      </g>
    {/each}

    {#each drawing.electronDots as dot (`${String(dot.mapNumber)}:${String(dot.angle)}`)}
      {#each dot.dotPoints as dotPoint, position (position)}
        <circle class="lpd" cx={dotPoint.x} cy={dotPoint.y} r={DOT_RADIUS} />
      {/each}
    {/each}

    {#each drawing.annotations as annotation, position (position)}
      <text class="lbl" x={annotation.point.x} y={annotation.point.y} text-anchor="middle">
        {annotation.text}
      </text>
    {/each}

    {#each arrows as { drawn, arrowClass }, position (position)}
      <path
        class={`arrow ${arrowClass}`}
        d={drawn.pathData}
        marker-end={drawn.electronsMoved === 2
          ? "url(#arrowhead-pair)"
          : "url(#arrowhead-fish-hook)"}
      />
    {/each}
  </g>

  {#if interactive}
    <g>
      {#each drawing.pickTargets as target (target.pickTargetId)}
        <circle
          class="hit"
          class:sel={target.pickTargetId === selectedTargetId}
          cx={target.center.x}
          cy={target.center.y}
          r={target.radius}
          role="button"
          tabindex="0"
          aria-label={target.accessibleName}
          aria-pressed={target.pickTargetId === selectedTargetId}
          data-target-id={target.pickTargetId}
          onclick={() => {
            // With a source picked, the canvas's own click listener picks the nearest place.
            if (destinations === null) {
              onPick(target);
            }
          }}
          onkeydown={(event) => {
            activate(event, () => {
              onPick(target);
            });
          }}
        />
      {/each}
      {#each newBondPlaces as place (place.target.pickTargetId)}
        <circle
          class="hit new-bond-hit"
          cx={place.target.center.x}
          cy={place.target.center.y}
          r={place.target.radius}
          role="button"
          tabindex="0"
          aria-label={place.target.accessibleName}
          data-target-id={place.target.pickTargetId}
          onclick={() => undefined}
          onkeydown={(event) => {
            activate(event, () => {
              onPick(place.target);
            });
          }}
        />
      {/each}
    </g>
  {/if}

  {#if destinations !== null}
    <g aria-hidden="true">
      {#if touchMode}
        {#each newBondPlaces as place (place.target.pickTargetId)}
          {#if place.newBondLine !== null}
            <line
              class="new-bond-line faint"
              x1={place.newBondLine.start.x}
              y1={place.newBondLine.start.y}
              x2={place.newBondLine.end.x}
              y2={place.newBondLine.end.y}
            />
          {/if}
        {/each}
      {/if}
      {#if preview !== null}
        {#if preview.newBondLine !== null}
          <line
            class="new-bond-line"
            x1={preview.newBondLine.start.x}
            y1={preview.newBondLine.start.y}
            x2={preview.newBondLine.end.x}
            y2={preview.newBondLine.end.y}
          />
        {/if}
        <path
          class="arrow preview"
          d={preview.preview.pathData}
          marker-end={preview.preview.electronsMoved === 2
            ? "url(#arrowhead-pair)"
            : "url(#arrowhead-fish-hook)"}
        />
      {/if}
    </g>
  {/if}

  {@render overlay?.()}
</svg>
