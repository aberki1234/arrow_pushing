/**
 * Tests for the site icons (app/icons/): both sites, the learner site and Create, link the same
 * favicon, a PNG fallback for browsers without SVG favicons, and the apple-touch icon for phone
 * home screens; and favicon.svg draws the same arrow as the header (brandMark.ts).
 * Create keeps a copy in its own app folder, since Vite's development server serves only files
 * inside the app folder; the copy must match byte for byte.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { brandMarkGeometry } from "../model/brandMark.js";

const iconsFolder = fileURLToPath(new URL("./icons/", import.meta.url));
const createAppFolder = fileURLToPath(
  new URL("../../../create/reactionEditor/app/", import.meta.url),
);
const iconFiles = ["favicon.svg", "favicon-32.png", "apple-touch-icon.png"];
const siteNameToIndexPage = {
  learnerSite: fileURLToPath(new URL("./index.html", import.meta.url)),
  create: resolve(createAppFolder, "index.html"),
};

/** The href of the first <link> whose attributes include every one of `requiredAttributes`. */
function linkHref(indexPage: string, requiredAttributes: readonly string[]): string | null {
  const links = readFileSync(indexPage, "utf-8").match(/<link\b[^>]*>/g) ?? [];
  const matching = links.find((link) =>
    requiredAttributes.every((attribute) => link.includes(attribute)),
  );
  return matching?.match(/href="([^"]+)"/)?.[1] ?? null;
}

/** Width and height in pixels, read from a PNG file's IHDR chunk (bytes 16–23, big-endian). */
function pngWidthAndHeight(path: string): [number, number] {
  const bytes = readFileSync(path);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe.each(Object.entries(siteNameToIndexPage))("%s index page", (siteName, indexPage) => {
  test.each([
    { requiredAttributes: ['rel="icon"', 'type="image/svg+xml"'], iconFile: "favicon.svg" },
    {
      requiredAttributes: ['rel="icon"', 'type="image/png"', 'sizes="32x32"'],
      iconFile: "favicon-32.png",
    },
    { requiredAttributes: ['rel="apple-touch-icon"'], iconFile: "apple-touch-icon.png" },
  ])("links $iconFile from the icons folder beside it", ({ requiredAttributes, iconFile }) => {
    const href = linkHref(indexPage, requiredAttributes);
    expect(href, `${siteName} index page`).not.toBeNull();
    const linkedPath = resolve(dirname(indexPage), href ?? "");
    expect(linkedPath).toBe(resolve(dirname(indexPage), "icons", iconFile));
    expect(existsSync(linkedPath)).toBe(true);
  });
});

test.each(iconFiles)("Create's copy of %s matches the learner site's", (iconFile) => {
  const createCopy = readFileSync(resolve(createAppFolder, "icons", iconFile));
  expect(createCopy.equals(readFileSync(resolve(iconsFolder, iconFile)))).toBe(true);
});

test("favicon.svg draws the header's arrow on a 32-unit tile", () => {
  const favicon = readFileSync(resolve(iconsFolder, "favicon.svg"), "utf-8");
  const geometry = brandMarkGeometry();
  const viewBoxSide = String(geometry.viewBoxSide);
  expect(favicon).toContain(`viewBox="0 0 ${viewBoxSide} ${viewBoxSide}"`);
  expect(favicon).toContain(`rx="${String(geometry.tileCornerRadius)}"`);
  expect(favicon).toContain(`d="${geometry.arrowShaftPath}"`);
  expect(favicon).toContain(`points="${geometry.arrowheadPoints}"`);
});

test.each([
  { iconFile: "favicon-32.png", side: 32 },
  // Apple's home-screen icon size for current iPhones.
  { iconFile: "apple-touch-icon.png", side: 180 },
])("$iconFile is $side × $side pixels", ({ iconFile, side }) => {
  expect(pngWidthAndHeight(resolve(iconsFolder, iconFile))).toEqual([side, side]);
});
