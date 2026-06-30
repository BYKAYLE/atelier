export function safeLocalStorageGet(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch (err) {
    console.warn("localStorage read skipped", key, err);
    return null;
  }
}

export function safeLocalStorageSet(key: string, value: string): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn("localStorage write skipped", key, err);
    return false;
  }
}
