import { performance } from "node:perf_hooks";

export const BASE_URL = (process.env.CLARA_BASE_URL || "https://clara.ai.amazetechclans.com").replace(/\/$/, "");
export const DEMO_AUTH = process.env.CLARA_DEMO_AUTH || "DEMO_MODE";
export const ORIGIN = process.env.CLARA_ORIGIN || BASE_URL;
export const QUERY = process.env.CLARA_TEST_QUERY || "What does my insurance cover?";
export const SESSION_ID = `visitor-test-${Date.now()}`;

export function url(path) { return `${BASE_URL}${path}`; }

export async function request(path, options = {}) {
  const started = performance.now();
  const response = await fetch(url(path), {
    redirect: "manual",
    ...options,
    headers: {
      Accept: "application/json, text/plain, */*",
      ...(options.headers || {}),
    },
  });
  const elapsedMs = performance.now() - started;
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { response, status: response.status, elapsedMs, text, json };
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function printResult(name, result, extra = "") {
  const state = result.ok === false ? "FAIL" : "PASS";
  console.log(`${state} | ${name} | HTTP ${result.status} | ${result.elapsedMs.toFixed(0)} ms${extra ? ` | ${extra}` : ""}`);
}

export function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${DEMO_AUTH}`,
    Origin: ORIGIN,
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function expectHttp(name, path, expectedStatuses, options = {}) {
  const result = await request(path, options);
  const ok = expectedStatuses.includes(result.status);
  printResult(name, { ...result, ok });
  assert(ok, `${name}: expected HTTP ${expectedStatuses.join("/")}, got ${result.status}: ${result.text.slice(0, 500)}`);
  return result;
}
