const STORAGE_KEY = "clara-platform-token";

export function getStoredToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(STORAGE_KEY);
}

export function setStoredToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, token);
}

export function clearStoredToken() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}

export function withAuthHeaders(headers: HeadersInit = {}) {
  const token = getStoredToken();
  const baseHeaders = new Headers(headers);

  if (token) {
    baseHeaders.set("Authorization", `Bearer ${token}`);
  }

  return baseHeaders;
}
