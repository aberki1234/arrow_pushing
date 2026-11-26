// @vitest-environment jsdom
/**
 * Tests for sharedTheme.ts: the theme cookie shared by arrowpushing.com and
 * create.arrowpushing.com, read before the progress setting.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  applySavedTheme,
  saveTheme,
  startingTheme,
  THEME_COOKIE_NAME,
  themeCookieDomain,
  themeCookieText,
  themeFromCookies,
} from "./sharedTheme.js";

describe("the cookie's domain", () => {
  it("is the parent domain on both sites, and none for a single host", () => {
    expect(themeCookieDomain("create.arrowpushing.com")).toBe("arrowpushing.com");
    expect(themeCookieDomain("arrowpushing.com")).toBe("arrowpushing.com");
    expect(themeCookieDomain("localhost")).toBeNull();
    expect(themeCookieDomain("127.0.0.1")).toBeNull();
    expect(themeCookieDomain("::1")).toBeNull();
  });
});

describe("reading and writing the cookie", () => {
  it("reads the theme among other cookies, ignoring unknown values", () => {
    expect(themeFromCookies(`a=1; ${THEME_COOKIE_NAME}=dark; b=2`)).toBe("dark");
    expect(themeFromCookies(`${THEME_COOKIE_NAME}=purple`)).toBeNull();
    expect(themeFromCookies("")).toBeNull();
  });

  it("writes a year-long, site-wide cookie on the parent domain", () => {
    expect(themeCookieText("light", "arrowpushing.com")).toBe(
      `${THEME_COOKIE_NAME}=light; Path=/; Max-Age=31536000; SameSite=Lax; ` +
        "Domain=arrowpushing.com",
    );
    expect(themeCookieText("dark", null)).not.toContain("Domain");
  });

  it("prefers the cookie to the progress setting", () => {
    expect(startingTheme(`${THEME_COOKIE_NAME}=light`, "dark")).toBe("light");
    expect(startingTheme("", "dark")).toBe("dark");
  });
});

describe("in the page", () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = `${THEME_COOKIE_NAME}=; Max-Age=0; Path=/`;
    delete document.documentElement.dataset["theme"];
  });

  it("applies what was saved, as the other site would read it", () => {
    saveTheme("dark");
    expect(themeFromCookies(document.cookie)).toBe("dark");
    // Only the cookie, as on the other site, where this origin's localStorage is not seen.
    localStorage.clear();
    applySavedTheme();
    expect(document.documentElement.dataset["theme"]).toBe("dark");
  });
});
