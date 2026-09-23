/**
 * src/lib/__tests__/runtime-dedup.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Covers the client-side GET de-duplication in fetchJsonShared():
 *  - concurrent identical GETs share ONE network round trip (and ONE body read)
 *  - settled results are NOT cached — a later GET is always a fresh request
 *  - mutating requests (non-GET) drop pending GET entries so post-mutation
 *    refetches never observe pre-mutation state
 *  - GETs with body / signal / custom cache mode bypass the dedup entirely
 *  - error statuses and network failures propagate to every merged caller
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearInflightGets, fetchJsonShared } from "@/lib/runtime";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => body,
  } as unknown as Response;
}

describe("fetchJsonShared GET de-duplication", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    // Emulate the browser: the dedup path only activates client-side.
    vi.stubGlobal("window", {});
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearInflightGets();
  });

  it("merges concurrent identical GETs into one round trip with one body read", async () => {
    const jsonSpy = vi.fn(async () => ({ orgs: [] }));
    let resolveFetch!: (r: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((res) => {
          resolveFetch = res;
        }),
    );

    const p1 = fetchJsonShared("/api/orgs", {});
    const p2 = fetchJsonShared("/api/orgs", {});
    const p3 = fetchJsonShared("/api/orgs", { method: "GET" });

    resolveFetch({ ok: true, status: 200, statusText: "OK", json: jsonSpy } as unknown as Response);
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The shared Response body is parsed exactly once no matter how many
    // callers joined the flight (a Response body is single-consumption).
    expect(jsonSpy).toHaveBeenCalledTimes(1);
    expect(r1.ok).toBe(true);
    expect(r2.body).toEqual({ orgs: [] });
    expect(r3.body).toEqual({ orgs: [] });
  });

  it("does not cache settled results — a later GET is a fresh round trip", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ n: 1 }));

    await fetchJsonShared("/api/me", {});
    await fetchJsonShared("/api/me", {});

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a mutation drops pending GET entries so post-mutation refetches are fresh", async () => {
    const getResolvers: Array<(r: Response) => void> = [];
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      if ((init.method ?? "GET").toUpperCase() === "GET") {
        return new Promise<Response>((res) => {
          getResolvers.push(res);
        });
      }
      return Promise.resolve(jsonResponse({ created: true }));
    });

    const stale = fetchJsonShared("/api/orgs", {}); // pre-mutation GET stays in flight
    const mutation = fetchJsonShared("/api/orgs", { method: "POST", body: "{}" });
    await mutation;
    const fresh = fetchJsonShared("/api/orgs", {}); // must NOT merge into `stale`

    // POST issued + stale GET + fresh GET = 3 round trips.
    expect(fetchMock).toHaveBeenCalledTimes(3);

    getResolvers[0](jsonResponse([{ id: "pre-mutation" }]));
    getResolvers[1](jsonResponse([{ id: "post-mutation" }]));

    expect((await stale).body).toEqual([{ id: "pre-mutation" }]);
    expect((await fresh).body).toEqual([{ id: "post-mutation" }]);
  });

  it("never merges mutating requests", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await Promise.all([
      fetchJsonShared("/api/orgs", { method: "POST", body: "{}" }),
      fetchJsonShared("/api/orgs", { method: "POST", body: "{}" }),
      fetchJsonShared("/api/orgs/1", { method: "DELETE" }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("bypasses the dedup for GETs carrying a body, signal or cache mode", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await Promise.all([
      fetchJsonShared("/api/poll", { method: "GET", body: "{}" }),
      fetchJsonShared("/api/poll", { method: "GET", body: "{}" }),
      fetchJsonShared("/api/poll", { cache: "no-store" }),
      fetchJsonShared("/api/poll", { cache: "no-store" }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("propagates error statuses and parsed error bodies to every merged caller", async () => {
    let resolveFetch!: (r: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((res) => {
          resolveFetch = res;
        }),
    );

    const p1 = fetchJsonShared("/api/kbs", {});
    const p2 = fetchJsonShared("/api/kbs", {});
    resolveFetch(jsonResponse({ error: "forbidden" }, false, 403));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r1.ok).toBe(false);
    expect(r1.status).toBe(403);
    expect(r1.body).toEqual({ error: "forbidden" });
    expect(r2.ok).toBe(false);
    expect(r2.body).toEqual({ error: "forbidden" });
  });

  it("propagates network failures to every merged caller and clears the slot", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    const p1 = fetchJsonShared("/api/orgs", {});
    const p2 = fetchJsonShared("/api/orgs", {});
    await expect(p1).rejects.toThrow("offline");
    await expect(p2).rejects.toThrow("offline");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The failed slot must be reusable: a later GET issues a new request.
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await fetchJsonShared("/api/orgs", {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bypasses the dedup outside the browser (SSR / node)", async () => {
    vi.unstubAllGlobals(); // remove window
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([
      fetchJsonShared("/api/orgs", {}),
      fetchJsonShared("/api/orgs", {}),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
