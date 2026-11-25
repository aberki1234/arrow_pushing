/**
 * Showing the field a check points at (editorSession.goToPlace's focusRequest): each field on
 * Create's pages carries data-field="<the reaction file's key>". The field's folded sections
 * (<details>) are opened, it is scrolled into view and focused (or the first control inside it),
 * and it flashes briefly so the eye finds it.
 */

const CONTROLS = "input, textarea, select, button";
const FLASH_MILLISECONDS = 1600;

/** Show the field named `field` inside `root`; false if the page has no such field. */
export function showField(root: ParentNode, field: string): boolean {
  const element = root.querySelector<HTMLElement>(`[data-field="${CSS.escape(field)}"]`);
  if (element === null) {
    return false;
  }
  for (let ancestor = element.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
    if (ancestor instanceof HTMLDetailsElement) {
      ancestor.open = true;
    }
  }
  // jsdom has no scrollIntoView.
  if (typeof element.scrollIntoView === "function") {
    element.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  const control = element.matches(CONTROLS)
    ? element
    : element.querySelector<HTMLElement>(CONTROLS);
  control?.focus({ preventScroll: true });
  element.classList.add("flash");
  setTimeout(() => {
    element.classList.remove("flash");
  }, FLASH_MILLISECONDS);
  return true;
}
