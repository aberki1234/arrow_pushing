/**
 * The light/dark theme, shared by the learner site and Create.
 *
 * `localStorage` belongs to one origin, so a theme saved only in the learner's progress
 * (settings.theme) on arrowpushing.com is not seen on create.arrowpushing.com. The choice is
 * therefore also kept in a cookie on the parent domain (Domain=arrowpushing.com), which both
 * sites read, and the progress setting stays as it was (export / import, older visits).
 *
 * Rules
 *   - At start: the cookie's theme, else the progress setting; "auto" follows the system.
 *   - Switching writes both. The cookie's domain is the hostname's last two labels
 *     (create.arrowpushing.com → arrowpushing.com); on localhost or an IP address it has no
 *     Domain attribute (that one host only). A browser that refuses the domain (a public suffix
 *     such as pages.dev) keeps the progress setting alone.
 */
import {
  readProgress,
  type ThemeSetting,
  withTheme,
  writeProgress,
} from "../../learnerProgress/learnerProgress.js";
import { browserStorage } from "./browserStorage.js";

export const THEME_COOKIE_NAME = "arrowpush_theme";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

const THEMES: readonly string[] = ["auto", "light", "dark"];

function isTheme(value: string): value is ThemeSetting {
  return THEMES.includes(value);
}

/** The Domain for the cookie, or null for a single host (localhost, an IP address). */
export function themeCookieDomain(hostname: string): string | null {
  const labels = hostname.split(".");
  const isIpAddress = /^[0-9.]+$/.test(hostname) || hostname.includes(":");
  if (isIpAddress || labels.length < 2) {
    return null;
  }
  return labels.slice(-2).join(".");
}

/** The theme in a `document.cookie` text, or null if none is there. */
export function themeFromCookies(cookieText: string): ThemeSetting | null {
  for (const cookie of cookieText.split(";")) {
    const [name, value] = cookie.trim().split("=");
    if (name === THEME_COOKIE_NAME && value !== undefined && isTheme(value)) {
      return value;
    }
  }
  return null;
}

/** The text to assign to `document.cookie` to remember `theme`. */
export function themeCookieText(theme: ThemeSetting, domain: string | null): string {
  const domainPart = domain === null ? "" : `; Domain=${domain}`;
  return (
    `${THEME_COOKIE_NAME}=${theme}; Path=/; Max-Age=${String(ONE_YEAR_SECONDS)}; SameSite=Lax` +
    domainPart
  );
}

/** The theme to start with: the shared cookie's, else the progress setting. */
export function startingTheme(cookieText: string, progressTheme: ThemeSetting): ThemeSetting {
  return themeFromCookies(cookieText) ?? progressTheme;
}

/** Set the page's theme from the cookie or the progress setting (each site's main.ts). */
export function applySavedTheme(): void {
  const theme = startingTheme(document.cookie, readProgress(browserStorage).settings.theme);
  if (theme !== "auto") {
    document.documentElement.dataset["theme"] = theme;
  }
}

/** Remember `theme` in the shared cookie and in the progress setting. */
export function saveTheme(theme: ThemeSetting): void {
  document.cookie = themeCookieText(theme, themeCookieDomain(window.location.hostname));
  writeProgress(browserStorage, withTheme(readProgress(browserStorage), theme));
}
