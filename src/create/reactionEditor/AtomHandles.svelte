<script lang="ts">
  // Handles on every atom of the drawing, drawn inside MoleculeCanvas's SVG (its overlay): in
  // "move atoms" mode an atom is dragged (the move is reported on release, in drawing pixels);
  // in "show H" mode a tap or Enter picks the atom.
  import type { StateDrawing } from "../../drawing/moleculeDrawing/stateDrawing.js";

  const {
    drawing,
    handleMode,
    onDragged,
    onPicked,
  }: {
    drawing: StateDrawing;
    handleMode: "drag" | "pick";
    onDragged: (mapNumber: number, deltaX: number, deltaY: number) => void;
    onPicked: (mapNumber: number) => void;
  } = $props();

  const HANDLE_RADIUS = 16;
  let dragged = $state<{ mapNumber: number; startX: number; startY: number } | null>(null);
  let offset = $state({ x: 0, y: 0 });

  /** A pointer position in the drawing's own pixels (the SVG view box). */
  function drawingPoint(event: PointerEvent): { x: number; y: number } {
    const svg = (event.currentTarget as SVGElement).ownerSVGElement;
    const matrix = svg?.getScreenCTM()?.inverse();
    if (svg === null || matrix === undefined) {
      return { x: event.clientX, y: event.clientY };
    }
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  }

  function start(event: PointerEvent, mapNumber: number): void {
    if (handleMode !== "drag") {
      return;
    }
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    const point = drawingPoint(event);
    dragged = { mapNumber, startX: point.x, startY: point.y };
    offset = { x: 0, y: 0 };
  }

  function move(event: PointerEvent): void {
    if (dragged !== null) {
      const point = drawingPoint(event);
      offset = { x: point.x - dragged.startX, y: point.y - dragged.startY };
    }
  }

  function finish(): void {
    if (dragged !== null && (offset.x !== 0 || offset.y !== 0)) {
      onDragged(dragged.mapNumber, offset.x, offset.y);
    }
    dragged = null;
    offset = { x: 0, y: 0 };
  }
</script>

<g class="atom-handles">
  {#each drawing.atoms as atom (atom.mapNumber)}
    {@const isDragged = dragged?.mapNumber === atom.mapNumber}
    <circle
      class="hit handle"
      class:sel={isDragged}
      cx={atom.point.x + (isDragged ? offset.x : 0)}
      cy={atom.point.y + (isDragged ? offset.y : 0)}
      r={HANDLE_RADIUS}
      role="button"
      tabindex="0"
      aria-label={handleMode === "drag"
        ? `Move atom ${atom.labelText.element}${String(atom.mapNumber)}`
        : `Show a hydrogen on ${atom.labelText.element}${String(atom.mapNumber)}`}
      onpointerdown={(event) => {
        start(event, atom.mapNumber);
      }}
      onpointermove={move}
      onpointerup={finish}
      onclick={() => {
        if (handleMode === "pick") {
          onPicked(atom.mapNumber);
        }
      }}
      onkeydown={(event) => {
        if (handleMode === "pick" && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onPicked(atom.mapNumber);
        }
      }}
    />
  {/each}
</g>
