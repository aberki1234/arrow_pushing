<script lang="ts">
  // Renders one state drawing (moleculeDrawing/stateDrawing.ts) as SVG: bonds, atom labels,
  // electron dots, annotations, curved arrows, and the pick targets the learner taps or reaches
  // with Tab and Enter. The "which atom forms the bond?" menu opens beside the tapped atom.
  import type { DrawnCurvedArrow } from "../moleculeDrawing/curvedArrowGeometry.js";
  import {
    LABEL_CHARACTER_WIDTH,
    type PickTarget,
    type StateDrawing,
    drawnAtomOf,
  } from "../moleculeDrawing/stateDrawing.js";
  import type { DestinationChoice } from "./stepScreenView.js";

  const {
    drawing,
    arrows,
    interactive,
    selectedTargetId,
    choice,
    onPick,
    onChoose,
    onCancelChoice,
  }: {
    drawing: StateDrawing;
    arrows: readonly { drawn: DrawnCurvedArrow; arrowClass: string }[];
    interactive: boolean;
    selectedTargetId: string | null;
    choice: DestinationChoice | null;
    onPick: (target: PickTarget) => void;
    onChoose: (optionIndex: number) => void;
    onCancelChoice: () => void;
  } = $props();

  // Label layout, in pixels at the 19 px label font.
  const CHARACTER_WIDTH = LABEL_CHARACTER_WIDTH;
  const CHARGE_RISE = 9;
  const DOT_RADIUS = 2.3;
  const CHOICE_OPTION_WIDTH = 150;
  const CHOICE_OPTION_HEIGHT = 28;
  const CHOICE_GAP = 6;
  const CHOICE_OFFSET = 22;
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
  const choiceOrigin = $derived(
    choice === null ? null : drawnAtomOf(drawing, choice.anchorMapNumber).point,
  );
  const choiceTransform = $derived(
    choiceOrigin === null
      ? ""
      : `translate(${String(choiceOrigin.x + CHOICE_OFFSET)} ` +
          `${String(choiceOrigin.y - CHOICE_OFFSET)})`,
  );

  function elementHalfWidth(element: string): number {
    return (element.length * CHARACTER_WIDTH) / 2;
  }

  function activate(event: KeyboardEvent, action: () => void): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  }

  /** Svelte action: focus the element when it appears, if `shouldFocus`. */
  function focusOnMount(node: SVGGElement, shouldFocus: boolean): void {
    if (shouldFocus) {
      node.focus();
    }
  }
</script>

<!-- Drawn at the view box's own size (one bond = 56 px); site.css lets it shrink to fit. -->
<svg
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
      {@const halfWidth = elementHalfWidth(atom.labelText.element)}
      {@const hydrogenWidth = atom.labelText.hydrogenText.length * CHARACTER_WIDTH}
      {@const rightEdge =
        atom.point.x + halfWidth + (atom.labelText.hydrogenSide === "right" ? hydrogenWidth : 0)}
      <g class:faded={atom.isSpectator}>
        <text class="at elem" x={atom.point.x} y={atom.point.y} text-anchor="middle">
          {atom.labelText.element}
        </text>
        {#if atom.labelText.hydrogenText !== ""}
          <text
            class="at h"
            x={atom.labelText.hydrogenSide === "right"
              ? atom.point.x + halfWidth
              : atom.point.x - halfWidth}
            y={atom.point.y}
            text-anchor={atom.labelText.hydrogenSide === "right" ? "start" : "end"}
          >
            {atom.labelText.hydrogenText}
          </text>
        {/if}
        {#if atom.labelText.chargeText !== ""}
          <text class="at chg" x={rightEdge + 1} y={atom.point.y - CHARGE_RISE} text-anchor="start">
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
          onclick={() => {
            onPick(target);
          }}
          onkeydown={(event) => {
            activate(event, () => {
              onPick(target);
            });
          }}
        />
      {/each}
    </g>
  {/if}

  {#if choice !== null && choiceOrigin !== null}
    <g
      class="choice-menu"
      role="menu"
      aria-label="Which atom forms the new bond?"
      transform={choiceTransform}
    >
      <rect
        class="panel"
        x={-CHOICE_GAP}
        y={-CHOICE_GAP}
        width={CHOICE_OPTION_WIDTH + 2 * CHOICE_GAP}
        height={choice.optionLabels.length * (CHOICE_OPTION_HEIGHT + CHOICE_GAP) + CHOICE_GAP}
        rx="8"
      />
      {#each choice.optionLabels as optionLabel, optionIndex (optionIndex)}
        <g
          class="option"
          role="menuitem"
          tabindex="0"
          aria-label={optionLabel}
          transform={`translate(0 ${String(optionIndex * (CHOICE_OPTION_HEIGHT + CHOICE_GAP))})`}
          use:focusOnMount={optionIndex === 0}
          onclick={() => {
            onChoose(optionIndex);
          }}
          onkeydown={(event) => {
            if (event.key === "Escape") {
              onCancelChoice();
            }
            activate(event, () => {
              onChoose(optionIndex);
            });
          }}
        >
          <rect width={CHOICE_OPTION_WIDTH} height={CHOICE_OPTION_HEIGHT} rx="6" />
          <text x="10" y={CHOICE_OPTION_HEIGHT / 2} dominant-baseline="central">{optionLabel}</text>
        </g>
      {/each}
    </g>
  {/if}
</svg>
