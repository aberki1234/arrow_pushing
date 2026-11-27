/**
 * The browser's localStorage for learner progress, or an in-memory stand-in when the browser
 * refuses it (private modes, storage turned off): the site still works, progress lasts the visit.
 */
import type { ProgressStorage } from "../../learnerProgress/learnerProgress.js";

function memoryStorage(): ProgressStorage {
  const keyToText = new Map<string, string>();
  return {
    getItem: (key): string | null => keyToText.get(key) ?? null,
    setItem: (key, value): void => {
      keyToText.set(key, value);
    },
    removeItem: (key): void => {
      keyToText.delete(key);
    },
  };
}

function usableLocalStorage(): ProgressStorage | null {
  try {
    const probeKey = "arrowpush.storageProbe";
    window.localStorage.setItem(probeKey, "1");
    window.localStorage.removeItem(probeKey);
    return window.localStorage;
  } catch {
    return null;
  }
}

/** One storage for the whole visit. */
export const browserStorage: ProgressStorage = usableLocalStorage() ?? memoryStorage();
