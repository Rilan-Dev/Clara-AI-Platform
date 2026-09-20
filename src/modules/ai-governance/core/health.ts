/**
 * src/modules/ai-governance/core/health.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side provider connection tests. ALWAYS executed on the server — the
 * browser never sees provider endpoints or credentials.
 *
 * Each test performs the cheapest authenticated round trip the vendor offers
 * and records the result in platform_ai_provider_health.
 */

import {
  getElevenLabsBaseUrl,
  getSarvamBaseUrl,
} from "@/modules/voice-core/model-catalog";
import { recordProviderHealth } from "./registry-db";
import type { GovernanceProviderId, ProviderHealthRecord } from "./types";

export type ProviderTestOutcome = {
  status: "healthy" | "degraded" | "down";
  latencyMs: number | null;
  errorMessage: string | null;
};

function timeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

async function fetchJson(url: string, headers: Record<string, string>, timeoutMs = 8_000): Promise<{ ok: boolean; status: number; body: string }> {
  const startedAt = Date.now();
  try {
    const res = await fetch(url, { headers, signal: timeoutSignal(timeoutMs) });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body: body.slice(0, 500) };
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    void elapsed;
    throw err;
  }
}

async function timedTest(
  label: string,
  run: () => Promise<{ ok: boolean; status: number; body: string }>,
): Promise<ProviderTestOutcome> {
  const startedAt = Date.now();
  try {
    const result = await run();
    const latencyMs = Date.now() - startedAt;
    if (result.ok) return { status: "healthy", latencyMs, errorMessage: null };
    // 401/403 with a live response still proves the endpoint + DNS + TLS work —
    // the credential is wrong, which is a "degraded" (configured but invalid).
    if (result.status === 401 || result.status === 403) {
      return { status: "degraded", latencyMs, errorMessage: `Authentication failed (HTTP ${result.status}).` };
    }
    return {
      status: "down",
      latencyMs,
      errorMessage: `${label} responded with HTTP ${result.status}.`,
    };
  } catch (err) {
    return {
      status: "down",
      latencyMs: null,
      errorMessage: `${label} connection failed: ${(err as Error).message}`,
    };
  }
}

/** Execute the provider-specific connection test WITHOUT recording health. */
export async function testProviderConnection(
  providerId: GovernanceProviderId,
): Promise<ProviderTestOutcome> {
  switch (providerId) {
    case "openai": {
      const key = process.env.OPENAI_API_KEY?.trim();
      if (!key) return { status: "down", latencyMs: null, errorMessage: "No API key configured." };
      return timedTest("OpenAI", () =>
        fetchJson("https://api.openai.com/v1/models?limit=1", {
          Authorization: `Bearer ${key}`,
        }),
      );
    }
    case "gemini": {
      const key = process.env.GEMINI_API_KEY?.trim();
      if (!key) return { status: "down", latencyMs: null, errorMessage: "No API key configured." };
      return timedTest("Gemini", () =>
        fetchJson(
          `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(key)}`,
          {},
        ),
      );
    }
    case "sarvam": {
      const key = process.env.SARVAM_API_KEY?.trim();
      if (!key) return { status: "down", latencyMs: null, errorMessage: "No API key configured." };
      const base = getSarvamBaseUrl();
      return timedTest("Sarvam", () =>
        fetchJson(`${base.replace(/\/$/, "")}/v1/models`, {
          Authorization: `Bearer ${key}`,
          "api-subscription-key": key,
        }),
      );
    }
    case "elevenlabs": {
      const key = process.env.ELEVENLABS_API_KEY?.trim();
      if (!key) return { status: "down", latencyMs: null, errorMessage: "No API key configured." };
      const base = getElevenLabsBaseUrl();
      return timedTest("ElevenLabs", () =>
        fetchJson(`${base.replace(/\/$/, "")}/v1/user`, {
          "xi-api-key": key,
        }),
      );
    }
  }
}

/** Test a provider and record the result (platform admin action). */
export async function testAndRecordProviderHealth(
  providerId: GovernanceProviderId,
  checkedBy: string | null,
): Promise<ProviderHealthRecord> {
  const outcome = await testProviderConnection(providerId);
  return recordProviderHealth(providerId, outcome, checkedBy);
}
