import { withAuthHeaders } from "@/lib/client-auth";

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getApiBaseUrl() {
  const envBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (envBase) return trimTrailingSlash(envBase);

  // // Fallback for production if the Vercel environment variable is missing
  // if (typeof window !== "undefined" && window.location.hostname.includes("vercel.app")) {
  //   return "https://clara-backend-production.up.railway.app";
  // }

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

// ── Client-side GET de-duplication ───────────────────────────────────────────
//
// The platform UI mounts several hooks/components per screen and many of them
// request the same read-only resources at the same moment (the app shell and
// every screen both call useAuth(); workspace tabs each call useKbs(); the
// auth chain and the org screens both hit /api/orgs). Without sharing, each
// mount issued its own network round trip: the browser waterfall showed
// /api/me, /api/orgs and /api/kbs firing 2x per navigation.
//
// fetchJsonShared() merges CONCURRENT identical GETs into a single round
// trip and hands every caller the same parsed result. It deliberately keeps
// NO TTL cache — a GET issued after another one completed is always a fresh
// request, so data shown to the user is never stale (access-control safe).
// Any mutating request (non-GET method) drops all pending GET entries before
// it is issued, guaranteeing post-mutation refetches observe fresh state.

export type SharedJsonResult = {
  ok: boolean;
  status: number;
  statusText: string;
  body: unknown;
};

const inflightGets = new Map<string, Promise<SharedJsonResult>>();

async function readBodyOnce(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export function clearInflightGets() {
  inflightGets.clear();
}

export async function fetchJsonShared(
  url: string,
  init: RequestInit,
): Promise<SharedJsonResult> {
  const method = (init.method ?? "GET").toUpperCase();

  // Mutations invalidate every pending GET result (their responses describe
  // pre-mutation state). Clear BEFORE the mutation request leaves so any
  // refetch issued after it starts a fresh round trip.
  if (method !== "GET") {
    inflightGets.clear();
    const res = await fetch(url, init);
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      body: await readBodyOnce(res),
    };
  }

  // Safety valves: never share GETs that carry a body, an abort signal or a
  // non-default cache mode (e.g. the signup screen's `cache: "no-store"`
  // verification poll), and bypass entirely outside the browser (SSR / tests).
  const shareable =
    typeof window !== "undefined" &&
    !init.body &&
    !init.signal &&
    !init.cache;
  if (!shareable) {
    const res = await fetch(url, init);
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      body: await readBodyOnce(res),
    };
  }

  let pending = inflightGets.get(url);
  if (!pending) {
    pending = (async () => {
      const res = await fetch(url, init);
      return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        body: await readBodyOnce(res),
      };
    })();
    inflightGets.set(url, pending);
    // Map cleanup lives on its own chain so the shared promise can reject
    // for every awaiting caller without an unhandled rejection here.
    void pending
      .catch(() => {})
      .then(() => {
        if (inflightGets.get(url) === pending) inflightGets.delete(url);
      });
  }
  return pending;
}

export async function apiFetchJson<T>(path: string, init: RequestInit = {}) {
  const headers = withAuthHeaders(init.headers ?? {});

  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const { ok, status, body } = await fetchJsonShared(apiUrl(path), {
    ...init,
    headers,
  });

  if (!ok) {
    const b = (body ?? {}) as { error?: string; message?: string };
    throw new Error(b.error ?? b.message ?? `HTTP ${status}`);
  }

  return body as T;
}
