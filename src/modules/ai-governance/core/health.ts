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
import { qwenEmbeddingsBaseUrl, QWEN_DEFAULT_MODEL } from "@/modules/ai-core/providers/qwen";
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
    if (result.status === 429) {
      return { status: "degraded", latencyMs, errorMessage: `${label} is reachable but rate-limited (HTTP 429).` };
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
      const base = getSarvamBaseUrl().replace(/\/$/, "");
      // Sarvam's authenticated model-serving endpoint is the most meaningful
      // health probe. /v1/models is not the credential validation path.
      const outcome = await timedTest("Sarvam", async () => {
        const res = await fetch(`${base}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
            "api-subscription-key": key,
          },
          body: JSON.stringify({
            model: "sarvam-105b-conversations",
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
            temperature: 0,
          }),
          signal: timeoutSignal(8_000),
        });
        return { ok: res.ok, status: res.status, body: (await res.text()).slice(0, 500) };
      });
      // Name the base URL being probed on failure — an operator-custom base
      // URL pointing at a non-Sarvam endpoint reads as a bare "unhealthy"
      // otherwise (observed: https://api.vendor.ai configured while the UI
      // said only "Provider Sarvam AI is currently unhealthy").
      if (outcome.status !== "healthy") {
        outcome.errorMessage = `${outcome.errorMessage ?? "Connectivity check failed."} (probing ${base})`;
      }
      return outcome;
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
    case "qwen": {
      // The cheapest meaningful round trip for an embeddings server is an
      // actual embedding of a one-token input — a bare /v1/models GET would
      // pass even when the model failed to load or --embedding is off.
      const base = qwenEmbeddingsBaseUrl();
      const apiKey = process.env.QWEN_API_KEY?.trim();
      const started = Date.now();
      try {
        const res = await fetch(base, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: process.env.QWEN_EMBEDDING_MODEL?.trim() || QWEN_DEFAULT_MODEL,
            input: ["ping"],
            encoding_format: "float",
          }),
          signal: timeoutSignal(10_000),
        });
        const latencyMs = Date.now() - started;
        if (res.ok) return { status: "healthy", latencyMs, errorMessage: null };
        return {
          status: "down",
          latencyMs,
          errorMessage: `Qwen embeddings server responded with HTTP ${res.status}. (probing ${base})`,
        };
      } catch (err) {
        return {
          status: "down",
          latencyMs: null,
          errorMessage: `Qwen embeddings server connection failed: ${(err as Error).message} (probing ${base})`,
        };
      }
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
