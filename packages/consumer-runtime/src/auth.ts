export function createTokenStorage(storageKey: string) {
  function getStoredToken() {
    if (typeof window === "undefined") {
      return null;
    }

    return window.localStorage.getItem(storageKey);
  }

  function setStoredToken(token: string) {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(storageKey, token);
  }

  function clearStoredToken() {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(storageKey);
  }

  function withAuthHeaders(headers: HeadersInit = {}) {
    const token = getStoredToken();
    const mergedHeaders = new Headers(headers);

    if (token) {
      mergedHeaders.set("Authorization", `Bearer ${token}`);
    }

    return mergedHeaders;
  }

  return {
    getStoredToken,
    setStoredToken,
    clearStoredToken,
    withAuthHeaders,
  };
}
