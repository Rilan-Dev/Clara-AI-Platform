/**
 * src/lib/runtime-flags.ts
 * Effective values of runtime switches that are configured only through
 * environment variables (no settings UI). Shown read-only on System Status so
 * operators can see how the platform is actually behaving.
 *
 * Never returns secret values — credentials are reported as set / not set.
 */

import { getRagRuntimeConfig } from "@/modules/rag/config";
import { resolveFeatureAvailability } from "@/lib/feature-availability";

export type RuntimeFlag = {
  key: string;
  label: string;
  value: string;
  /** True when the value comes from the built-in default, not the env. */
  isDefault: boolean;
  /** Plain-English consequence, shown under the value. */
  note?: string;
  /** Highlight values an operator should review. */
  attention?: boolean;
};

export type RuntimeFlagGroup = { id: string; title: string; flags: RuntimeFlag[] };

type Env = Record<string, string | undefined>;

function raw(env: Env, key: string): string | undefined {
  const v = env[key]?.trim();
  return v ? v : undefined;
}

function flag(env: Env, key: string, label: string, fallback: string, note?: string): RuntimeFlag {
  const v = raw(env, key);
  return { key, label, value: v ?? fallback, isDefault: v === undefined, note };
}

function isSet(env: Env, key: string, label: string, note?: string): RuntimeFlag {
  const v = raw(env, key);
  return { key, label, value: v ? "Configured" : "Not configured", isDefault: !v, note };
}

export function describeRuntimeFlags(env: Env = process.env): RuntimeFlagGroup[] {
  const rag = getRagRuntimeConfig();
  const failMode = (raw(env, "PLAN_GUARD_FAIL_MODE") ?? "open").toLowerCase();
  const virusScan = raw(env, "VIRUS_SCAN_URL");
  const features = resolveFeatureAvailability(env);

  return [
    {
      id: "features",
      title: "Deployment feature availability",
      flags: [
        {
          key: "CLARA_FEATURE_EMBEDDABLE_WIDGET",
          label: "Embeddable website widget & demo",
          value: features.embeddableWidget ? "Enabled" : "Disabled",
          isDefault: raw(env, "CLARA_FEATURE_EMBEDDABLE_WIDGET") === undefined,
          note: "Server-enforced for widget APIs, visitor pages and management. Defaults on only in development.",
        },
        {
          key: "CLARA_FEATURE_INTEGRATIONS",
          label: "Integrations, MCP & WhatsApp",
          value: features.integrations ? "Enabled" : "Disabled",
          isDefault: raw(env, "CLARA_FEATURE_INTEGRATIONS") === undefined,
          note: "Server-enforced for management, callbacks, webhooks and tool execution. Existing MCP governance still applies.",
        },
      ],
    },
    {
      id: "rag",
      title: "Retrieval (RAG)",
      flags: [
        {
          key: "RAG_MODE",
          label: "Effective RAG mode",
          value: rag.ragMode,
          isDefault: raw(env, "RAG_MODE") === undefined,
          note: rag.ragMode !== rag.requestedMode
            ? `Requested "${rag.requestedMode}", downgraded because a required feature is off.`
            : undefined,
        },
        { key: "ENABLE_GRAPH_RAG", label: "Graph RAG", value: rag.enableGraphRag ? "On" : "Off", isDefault: raw(env, "ENABLE_GRAPH_RAG") === undefined },
        { key: "ENABLE_AGENT_LOOP", label: "Agent loop", value: rag.enableAgentLoop ? "On" : "Off", isDefault: raw(env, "ENABLE_AGENT_LOOP") === undefined },
        { key: "ENABLE_SELF_EVAL", label: "Self-evaluation", value: rag.enableSelfEval ? "On" : "Off", isDefault: raw(env, "ENABLE_SELF_EVAL") === undefined },
        { key: "ENABLE_MCP", label: "MCP tools", value: rag.enableMcp ? "On" : "Off", isDefault: raw(env, "ENABLE_MCP") === undefined },
        { key: "GRAPH_STORE_PROVIDER", label: "Graph store", value: rag.graphStoreProvider, isDefault: raw(env, "GRAPH_STORE_PROVIDER") === undefined },
      ],
    },
    {
      id: "safety",
      title: "Quotas & safety",
      flags: [
        {
          key: "PLAN_GUARD_FAIL_MODE",
          label: "Quota check when the database errors",
          value: failMode === "closed" ? "Fail closed (refuse)" : "Fail open (allow)",
          isDefault: raw(env, "PLAN_GUARD_FAIL_MODE") === undefined,
          note: failMode === "closed"
            ? "Requests are refused if plan limits can't be verified."
            : "Requests are allowed if plan limits can't be verified — usage may exceed plan caps during an outage.",
          attention: failMode !== "closed",
        },
        {
          key: "VIRUS_SCAN_URL",
          label: "Upload virus scanning",
          value: virusScan ? "On" : "Off",
          isDefault: !virusScan,
          note: virusScan ? undefined : "Uploaded documents are not scanned for malware.",
          attention: !virusScan,
        },
        isSet(env, "VIRUS_SCAN_API_KEY", "Virus scan API key"),
        flag(env, "ALLOWED_ORIGINS", "Allowed CORS origins", "(none — same origin only)"),
        isSet(env, "CLARA_SUPPORT_EMAIL", "Support inbox (contact form, billing reviews)",
          raw(env, "CLARA_SUPPORT_EMAIL") ? undefined : "Contact-form leads and billing reviews cannot be delivered."),
      ],
    },
    {
      id: "voice",
      title: "Realtime voice tuning",
      flags: [
        flag(env, "REALTIME_VAD_THRESHOLD", "Voice activity threshold", "provider default"),
        flag(env, "REALTIME_VAD_SILENCE_DURATION_MS", "End-of-speech silence (ms)", "provider default"),
        flag(env, "REALTIME_VAD_PREFIX_PADDING_MS", "Speech prefix padding (ms)", "provider default"),
        flag(env, "REALTIME_NOISE_SUPPRESSION", "Noise suppression", "browser default"),
        flag(env, "REALTIME_ECHO_CANCELLATION", "Echo cancellation", "browser default"),
        flag(env, "REALTIME_AUTO_GAIN_CONTROL", "Auto gain control", "browser default"),
        flag(env, "REALTIME_MIN_QUERY_LENGTH", "Minimum query length", "built-in default"),
        flag(env, "REALTIME_RAG_DEBOUNCE_MS", "Retrieval debounce (ms)", "built-in default"),
        flag(env, "OPENAI_REALTIME_VOICE", "OpenAI realtime voice", "built-in default"),
        flag(env, "OPENAI_REALTIME_TRANSCRIPTION_MODEL", "OpenAI realtime transcription", "built-in default"),
        flag(env, "GEMINI_LIVE_MODEL", "Gemini Live model", "built-in default"),
      ],
    },
    {
      id: "costs",
      title: "Cost rates used by analytics",
      flags: [
        flag(env, "ELEVENLABS_TTS_USD_PER_1K_CHARS", "ElevenLabs TTS ($ / 1k chars)", "built-in default"),
        flag(env, "ELEVENLABS_STT_USD_PER_MIN", "ElevenLabs STT ($ / min)", "built-in default"),
        flag(env, "ELEVENLABS_CONV_USD_PER_MIN", "ElevenLabs conversational ($ / min)", "built-in default"),
        flag(env, "SARVAM_TTS_USD_PER_1K_CHARS", "Sarvam TTS ($ / 1k chars)", "built-in default"),
        flag(env, "SARVAM_STT_USD_PER_MIN", "Sarvam STT ($ / min)", "built-in default"),
        flag(env, "SARVAM_TRANSLATE_USD_PER_10K_CHARS", "Sarvam translate ($ / 10k chars)", "built-in default"),
      ],
    },
    {
      id: "ingest",
      title: "Ingestion",
      flags: [
        flag(env, "INGEST_POLLER_ENABLED", "Background ingest poller", "built-in default"),
        flag(env, "INGEST_POLLER_INTERVAL_MS", "Poller interval (ms)", "built-in default"),
        flag(env, "INGEST_STALE_JOB_MS", "Stale job timeout (ms)", "built-in default"),
        flag(env, "EMBED_BATCH_SIZE", "Embedding batch size", "built-in default"),
        flag(env, "EMBED_MAX_RETRIES", "Embedding retries", "built-in default"),
        flag(env, "UPSERT_BATCH_SIZE", "Vector upsert batch size", "built-in default"),
      ],
    },
  ];
}
