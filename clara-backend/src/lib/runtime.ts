import { withAuthHeaders } from "@/lib/client-auth";

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getApiBaseUrl() {
  const envBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (envBase) return trimTrailingSlash(envBase);

  // Fallback for production if the Vercel environment variable is missing
  if (process.env.NODE_ENV === "production" || typeof window !== "undefined" && window.location.hostname.includes("vercel.app")) {
    return "https://clara-backend-production.up.railway.app";
  }

  return "";
}

export function apiUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const normalisedPath = path.startsWith("/") ? path : `/${path}`;
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}${normalisedPath}`;
}

export async function apiFetchJson<T>(path: string, init: RequestInit = {}) {
  const headers = withAuthHeaders(init.headers ?? {});

  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(apiUrl(path), {
    ...init,
    headers,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(body.error ?? body.message ?? `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}
