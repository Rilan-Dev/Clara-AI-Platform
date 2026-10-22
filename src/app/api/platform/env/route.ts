import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { ensureMigrated } from "@/lib/db/migrate";
import { getPlatformEnvSettings, setPlatformEnvSetting } from "@/modules/phone/core/db";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { invalidateOpenAICatalogCache } from "@/modules/assistant/api/openai-catalog-cache";
import { resetEmailTransportCache } from "@/lib/email";
import { validateModelField } from "@/modules/ai-core/model-catalog";
import { listProviderModels } from "@/modules/ai-governance/core/registry-db";
import { isPlaceholderProviderBaseUrl } from "@/modules/voice-core/model-catalog";
import { isPlatformFeatureEnabled } from "@/lib/feature-availability";

// WS-0.4: model keys that must hold a model id from the correct catalogue.
const MODEL_FIELD_KEYS: Record<string, { field: "chat" | "embedding"; provider: "openai" | "gemini" }> = {
  OPENAI_CHAT_MODEL:        { field: "chat",      provider: "openai" },
  OPENAI_EMBEDDING_MODEL:   { field: "embedding", provider: "openai" },
  GEMINI_CHAT_MODEL:        { field: "chat",      provider: "gemini" },
  GEMINI_EMBEDDING_MODEL:   { field: "embedding", provider: "gemini" },
};

const LIVE_MODEL_FIELD_KEYS: Record<string, {
  providerId: "openai" | "gemini" | "elevenlabs";
  capability: "chat" | "voice_chat" | "realtime_voice";
  kinds: string[];
}> = {
  OPENAI_REALTIME_MODEL: { providerId: "openai", capability: "realtime_voice", kinds: ["realtime"] },
  GEMINI_REALTIME_MODEL: { providerId: "gemini", capability: "realtime_voice", kinds: ["realtime"] },
  ELEVENLABS_DEFAULT_TTS_MODEL: { providerId: "elevenlabs", capability: "voice_chat", kinds: ["tts"] },
};

function getConfirmSecret(): string {
  const secret =
    process.env.PLATFORM_CONFIRM_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    process.env.AUTH_SECRET;

  if (
    !secret ||
    (process.env.NODE_ENV === "production" && secret.length < 32)
  ) {
    throw new Error("A strong platform confirmation secret is required.");
  }

  return secret;
}

const TOKEN_TTL_MS = 5 * 60 * 1000;
const MASK = "●●●●●●●●";
const MANAGED_KEYS = new Set([
  "NEXT_PUBLIC_LANDING_EMBED_API_KEY",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_STARTER", "STRIPE_PRICE_PRO",
  "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "NEXT_PUBLIC_RAZORPAY_KEY_ID", "NEXT_PUBLIC_APP_URL",
  // AI Configuration
  "AI_PROVIDER", "AI_EMBEDDING_PROVIDER",
  "OPENAI_API_KEY", "OPENAI_CHAT_MODEL", "OPENAI_EMBEDDING_MODEL", "OPENAI_REALTIME_MODEL", "OPENAI_TRANSCRIPTION_MODEL", "OPENAI_DEFAULT_VOICE",
  "GEMINI_API_KEY", "GEMINI_CHAT_MODEL", "GEMINI_EMBEDDING_MODEL", "GEMINI_REALTIME_MODEL", "GEMINI_TRANSCRIPTION_MODEL", "GEMINI_DEFAULT_VOICE",
  "ELEVENLABS_API_KEY", "ELEVENLABS_DEFAULT_TTS_MODEL", "ELEVENLABS_DEFAULT_STT_MODEL", "ELEVENLABS_DEFAULT_VOICE_ID", "ELEVENLABS_REALTIME_ENABLED", "ELEVENLABS_SPEECH_ENGINE_ENABLED", "ELEVENLABS_SPEECH_ENGINE_ID",
  // ElevenLabs Mode B / studio (V4-V6) — secrets + flags
  "ELEVENLABS_CONVERSATIONAL_AI_ENABLED", "ELEVENLABS_VOICE_CLONING_ENABLED", "ELEVENLABS_VOICE_DESIGN_ENABLED",
  "ELEVENLABS_TOOL_HMAC_SECRET", "ELEVENLABS_WEBHOOK_SECRET", "ELEVENLABS_CREDIT_ALERT_THRESHOLD_PCT",
  // Sarvam AI — Indic brain, voice & language services
  // (Doc/SARVAM_AI_INTEGRATION.md §Platform settings; kept in lockstep with
  // the PlatformEnvPanel CATEGORY_KEYS.ai list and migration 036's seeded
  // platform_env_settings rows — without these entries the Settings → AI
  // Sarvam section can render but every save is rejected with 403
  // "Setting is not managed by the platform settings page".)
  "SARVAM_API_KEY", "SARVAM_BASE_URL", "SARVAM_TIMEOUT_MS",
  "SARVAM_CHAT_MODEL", "SARVAM_BETA_MODELS_ENABLED",
  "SARVAM_TTS_MODEL", "SARVAM_STT_MODEL", "SARVAM_DEFAULT_SPEAKER",
  "SARVAM_EMBEDDING_FALLBACK_PROVIDER", "SARVAM_TRANSLATION_ENABLED", "SARVAM_TRANSLATE_MODEL",
  "SARVAM_INR_TO_USD", "SARVAM_REALTIME_STT_MODEL", "SARVAM_REALTIME_LLM_MODEL", "SARVAM_REALTIME_TTS_ENABLED",
  "SARVAM_REALTIME_VAD_THRESHOLD", "SARVAM_REALTIME_SILENCE_MS", "SARVAM_REALTIME_MIN_SPEECH_MS", "SARVAM_TTS_PACE",
  "AI_MAX_CHAT_TOKENS", "AI_MAX_REALTIME_TOKENS", "AI_MAX_TEMPERATURE",
  // Multilingual knowledge index (migration 059)
  "MULTILINGUAL_EMBEDDINGS_ENABLED", "MULTILINGUAL_EMBEDDINGS_BASE_URL", "MULTILINGUAL_EMBEDDINGS_API_KEY",
  "MULTILINGUAL_EMBEDDINGS_MODEL", "MULTILINGUAL_EMBEDDINGS_DIMENSION",
  // Phone Configuration
  "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER",
  "VONAGE_API_KEY", "VONAGE_API_SECRET", "VONAGE_PHONE_NUMBER",
  "PHONE_PROVIDER",
  // Email Delivery (Resend / SMTP switcher — Settings → Email Delivery)
  "EMAIL_PROVIDER", "EMAIL_FROM_NAME", "EMAIL_FROM_ADDRESS",
  "RESEND_API_KEY",
  "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM_ADDRESS",
]);

function buildToken(key: string, value: string, ts: number): string {
  return crypto
    .createHmac("sha256", getConfirmSecret())
    .update(`${key}:${value}:${ts}`)
    .digest("hex");
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const { searchParams } = new URL(req.url);

    // Confirmation tokens used to be minted here with the (possibly secret)
    // value in the query string, which leaks it into access logs and browser
    // history. They are now requested with POST { action: "token" }.
    if (searchParams.get("token") === "1") {
      return NextResponse.json(
        { error: "Request confirmation tokens with POST { action: \"token\", key, value }." },
        { status: 405 },
      );
    }

    const settings = await getPlatformEnvSettings();
    const safe = settings
      .filter(s => MANAGED_KEYS.has(s.key) &&
        (s.key !== "NEXT_PUBLIC_LANDING_EMBED_API_KEY" || isPlatformFeatureEnabled("embeddableWidget")))
      .map(s => {
        const effective = s.value || process.env[s.key] || "";
        return {
          key: s.key,
          value: s.isSecret ? (effective ? MASK : "") : effective,
          isSet: Boolean(effective),
          description: s.description,
          category: s.category,
          isSecret: s.isSecret,
          requiresRestart: false,
          updatedAt: s.updatedAt,
        };
      });

    return NextResponse.json({ settings: safe });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const body = await req.json() as {
      action?: string;
      key?: string;
      value?: string;
      confirmation_token?: string;
      timestamp?: number;
    };

    // This widget-only key is managed through the shared platform env route.
    // Hiding the widget settings page must not leave token minting or a saved
    // confirmation token able to mutate the disabled feature.
    if (body.key === "NEXT_PUBLIC_LANDING_EMBED_API_KEY" && !isPlatformFeatureEnabled("embeddableWidget")) {
      return NextResponse.json(
        { error: "This feature is not available in this environment.", code: "FEATURE_DISABLED" },
        { status: 404 },
      );
    }

    // Step 1 of a save: mint a short-lived HMAC confirmation token. The value
    // travels in the request body, never in the URL.
    if (body.action === "token") {
      const key = body.key ?? "";
      if (!MANAGED_KEYS.has(key)) {
        return NextResponse.json({ error: "Setting is not managed by the platform settings page." }, { status: 403 });
      }
      const ts = Date.now();
      return NextResponse.json({
        confirmation_token: buildToken(key, body.value ?? "", ts),
        timestamp: ts,
        expires_in_ms: TOKEN_TTL_MS,
      });
    }

    if (!body.key || body.value === undefined) {
      return NextResponse.json({ error: "key and value are required" }, { status: 400 });
    }
    if (!MANAGED_KEYS.has(body.key)) {
      return NextResponse.json({ error: "Setting is not managed by the platform settings page." }, { status: 403 });
    }

    const current = (await getPlatformEnvSettings()).find(s => s.key === body.key);
    if (current?.isSecret && body.value === MASK) {
      return NextResponse.json({ ok: true, key: body.key, updatedAt: new Date().toISOString() });
    }

    const ts = Number(body.timestamp ?? 0);
    if (!body.confirmation_token || !ts) {
      return NextResponse.json({ error: "confirmation_token and timestamp are required." }, { status: 400 });
    }
    if (Math.abs(Date.now() - ts) > TOKEN_TTL_MS) {
      return NextResponse.json({ error: "Confirmation token expired." }, { status: 400 });
    }

    const expected = buildToken(body.key, body.value, ts);
    const provided = body.confirmation_token.padEnd(64, "0").slice(0, 64);
    let valid = false;
    try {
      valid = crypto.timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(provided, "hex"),
      );
    } catch {
      valid = false;
    }
    if (!valid) {
      return NextResponse.json({ error: "Invalid confirmation token." }, { status: 403 });
    }

    if (body.key === "AI_EMBEDDING_PROVIDER" && !["", "openai", "gemini"].includes(body.value.trim().toLowerCase())) {
      return NextResponse.json({ error: "AI_EMBEDDING_PROVIDER must be openai or gemini." }, { status: 400 });
    }

    // Base-URL settings: reject the provider-settings placeholder example
    // (api.vendor.ai — a dead domain that does not resolve). It leaked into
    // live SARVAM_BASE_URL configs twice and silently broke every Sarvam
    // call with connect timeouts; a copy-paste of the old field hint must
    // never reach the egress path again.
    if (
      (body.key === "SARVAM_BASE_URL" || body.key === "MULTILINGUAL_EMBEDDINGS_BASE_URL") &&
      typeof body.value === "string" &&
      isPlaceholderProviderBaseUrl(body.value)
    ) {
      return NextResponse.json(
        {
          error: "invalid_base_url",
          code: "BASE_URL_PLACEHOLDER",
          key: body.key,
          message:
            "api.vendor.ai is the field's old placeholder example, not a real endpoint — the domain does not resolve. " +
            "Leave the value empty to use the official endpoint, or set a proxy you know is reachable.",
        },
        { status: 400 },
      );
    }

    // WS-0.4: server-side catalogue check — a chat model saved into an
    // embedding key is rejected even when the request bypasses the UI.
    const modelField = MODEL_FIELD_KEYS[body.key];
    if (modelField) {
      const validation = validateModelField({
        field: modelField.field,
        model: body.value,
        provider: modelField.provider,
      });
      if (!validation.ok) {
        return NextResponse.json(
          { error: "invalid_model_selection", code: validation.code, key: body.key, message: validation.message },
          { status: 400 },
        );
      }
    }

    // Model IDs in realtime/TTS settings must exist in the vendor-refreshed
    // catalogue for the exact capability. Empty values still mean "inherit".
    const liveModelField = LIVE_MODEL_FIELD_KEYS[body.key];
    if (liveModelField && typeof body.value === "string" && body.value.trim()) {
      const requestedModelId = body.value.trim().replace(/^models\//, "");
      const liveRows = await listProviderModels(liveModelField.providerId, liveModelField.capability);
      const available = liveRows.some((row) =>
        row.enabled &&
        row.metadata.catalogSource === "vendor_live" &&
        liveModelField.kinds.includes(row.kind) &&
        row.modelId === requestedModelId,
      );
      if (!available) {
        return NextResponse.json(
          {
            error: "invalid_model_selection",
            code: "MODEL_NOT_IN_LIVE_CATALOG",
            key: body.key,
            message: "Choose a model currently advertised by the configured provider for this capability.",
          },
          { status: 400 },
        );
      }
    }

    await setPlatformEnvSetting(body.key, body.value, auth.user.id);

    // Voice / AI catalog provenance: rotating an OpenAI key or model changes
    // what the Voice tab should show, so reset its Redis cache (best-effort).
    if (body.key.startsWith("OPENAI_")) {
      try { await invalidateOpenAICatalogCache(); } catch { /* cache reset is best-effort */ }
    }

    // Email provider switches must not reuse the old SMTP transporter.
    if (
      body.key.startsWith("SMTP_") ||
      body.key.startsWith("EMAIL_") ||
      body.key === "RESEND_API_KEY"
    ) {
      resetEmailTransportCache();
    }

    // Speech Engine is attached by the custom server at boot; retry now so a
    // freshly saved ID/key/switch takes effect without a restart.
    if (
      body.key === "ELEVENLABS_SPEECH_ENGINE_ID" ||
      body.key === "ELEVENLABS_SPEECH_ENGINE_ENABLED" ||
      body.key === "ELEVENLABS_API_KEY"
    ) {
      const attach = (globalThis as { __claraAttachSpeechEngine?: () => Promise<boolean> }).__claraAttachSpeechEngine;
      if (attach) void attach().catch(() => undefined);
    }

    return NextResponse.json({
      ok: true,
      key: body.key,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
