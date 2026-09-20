/**
 * src/modules/voice-core/api/elevenlabs/webhooks.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The two signed inbound paths of the ElevenLabs integration (plan §6).
 *
 *   POST /api/internal/elevenlabs/tools/rag-search   — Mode-B server tool
 *     The vendor agent calls this DURING a conversation to ground answers in
 *     the tenant's Clara knowledge base. Authenticated with the static
 *     shared token (x-clara-tool-token) baked into the tool config by
 *     ElevenLabsVoiceProvider.createConversationalAgent (webhook-auth.ts);
 *     the tenant ids ride along as constant headers (x-clara-org-id /
 *     x-clara-kb-id / x-clara-agent-id) and are re-validated against the
 *     elevenlabs_agents binding below — the disclosed Mode-B boundary
 *     (plan §3.3): per-turn answer snippets transit the vendor, documents
 *     never do.
 *
 *   POST /api/webhooks/elevenlabs/post-call         — vendor post-call
 *     Delivery of transcripts/analytics after a Mode-B conversation ends.
 *     Authenticated with the vendor signature scheme
 *     (elevenlabs-signature: HMAC-SHA256 of the raw body with
 *     ELEVENLABS_WEBHOOK_SECRET). Transcripts are PII-redacted BEFORE
 *     insert; CONVERSATION usage is metered from measured duration.
 *
 * Both handlers read the RAW body (req.text()) — signature verification
 * needs the exact bytes — and must stay excluded from any body-rewriting
 * middleware (same discipline as /api/webhooks/stripe).
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query as dbQuery } from "@/lib/db";
import { redactText } from "@/lib/redact";
import { groundClaraContext } from "@/modules/rag/grounding";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { appUrl } from "@/lib/stripe";
import { setPlatformEnvSetting } from "@/modules/phone/core/db";
import { getWebhookSecret, isElevenLabsEnabled, isValidUuid } from "../../model-catalog";
import { logConversationUsage } from "../../metering";
import { VoiceProviderFactory } from "../../factory";
import { ElevenLabsError } from "../../providers/elevenlabs";
import { isConversationalVoiceService } from "../../types";
import {
  sweepExpiredNonces,
  verifyInternalToolCall,
  verifyVendorWebhookSignature,
} from "../../webhook-auth";

/** Tool-callback request caps (abuse guards — plan §11.8). */
const TOOL_QUERY_MAX_CHARS = 500;
const TOOL_TOPK_MAX = 5;

/**
 * Resolves a tenant id from the tool-config constant headers first, falling
 * back to the JSON body for pre-modernisation tool configs.
 */
function headerOrBody(
  headers: Headers,
  payload: Record<string, unknown>,
  headerName: string,
  bodyKey: string,
): string | null {
  const fromHeader = headers.get(headerName)?.trim();
  if (fromHeader) return fromHeader;
  const fromBody = payload[bodyKey];
  return typeof fromBody === "string" && fromBody.trim() ? fromBody.trim() : null;
}

// ─── Internal Mode-B RAG server tool ─────────────────────────────────────────

export async function postElevenLabsToolRagSearch(request: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await request.text();

    // ── Authenticity: HMAC + timestamp window + nonce replay guard ──────────
    const auth = await verifyInternalToolCall(rawBody, request.headers);
    if (!auth.verified) {
      const status = auth.failure === "missing_secret" ? 503 : 401;
      return NextResponse.json(
        { error: `Tool callback rejected (${auth.failure}).` },
        { status },
      );
    }

    // ── Payload ──────────────────────────────────────────────────────────────
    // Current tool schema: the LLM supplies only {query}; the tenant ids are
    // CONSTANT HEADERS from the tool config (x-clara-org-id/-kb-id/-agent-id).
    // Body-supplied ids remain accepted for tool configs created before the
    // 2026-09 modernisation.
    const payload = JSON.parse(rawBody || "{}") as Record<string, unknown>;
    const orgId = headerOrBody(request.headers, payload, "x-clara-org-id", "orgId");
    const agentId = headerOrBody(request.headers, payload, "x-clara-agent-id", "agentId");
    const kbId = headerOrBody(request.headers, payload, "x-clara-kb-id", "kbId");
    const query = typeof payload.query === "string" ? payload.query.trim().slice(0, TOOL_QUERY_MAX_CHARS) : "";
    const topKRaw = Number(payload.topK ?? 4);
    const topK = Number.isFinite(topKRaw) ? Math.min(Math.max(Math.round(topKRaw), 1), TOOL_TOPK_MAX) : 4;

    if (!orgId || !kbId || !query) {
      return NextResponse.json(
        { error: "orgId, kbId and query are required." },
        { status: 400 },
      );
    }
    // UUID shape gate — malformed ids must 400, never reach the ::uuid casts.
    if (!isValidUuid(orgId) || !isValidUuid(kbId) || (agentId != null && !isValidUuid(agentId))) {
      return NextResponse.json(
        { error: "orgId, kbId and agentId must be UUIDs." },
        { status: 400 },
      );
    }

    await ensureMigrated();

    // ── Tenant validation: the binding must exist for THIS org + agent ──────
    // The tool config was registered with these ids when the Mode-B agent was
    // created; re-validating against elevenlabs_agents means a compromised
    // vendor workspace cannot redirect its tool at another tenant's KB.
    const bindings = await dbQuery<{ id: string; enabled: boolean; org_acknowledged_data_flow: boolean }>(
      `SELECT id, enabled, org_acknowledged_data_flow
         FROM elevenlabs_agents
        WHERE org_id = $1 AND mode = 'conversational'
          AND ($2::uuid IS NULL OR agent_id = $2::uuid)`,
      [orgId, agentId],
    );
    const binding = bindings[0];
    if (!binding || !binding.enabled || !binding.org_acknowledged_data_flow) {
      return NextResponse.json(
        { error: "No active Mode-B agent binding for this organisation." },
        { status: 403 },
      );
    }

    // The KB must belong to the same org as the binding.
    const kbRows = await dbQuery<{ agent_org_id: string }>(
      `SELECT a.org_id AS agent_org_id
         FROM agents a JOIN knowledge_bases kb ON kb.agent_id = a.id
        WHERE kb.id = $1`,
      [kbId],
    );
    if (!kbRows[0] || kbRows[0].agent_org_id !== orgId) {
      return NextResponse.json({ error: "Knowledge base not found for this organisation." }, { status: 404 });
    }

    // ── Retrieval: the ONE provider-neutral Clara grounding entry point ────
    // (plan Task 3.1). Audit-only admission — Mode B meters its quota at
    // post-call (chat.ts modeBAdmission); admitting here would double-bill.
    // The binding checks above (org + KB-org match) remain the vendor-side
    // authorization boundary; the service re-resolves the tenant from the
    // KB server-side, so a provider can never select another tenant/KB.
    const outcome = await groundClaraContext({
      kbId,
      query,
      topK,
      surface: "voice",
      admission: "audit-only",
    });
    if (!outcome.ok) {
      if (outcome.status === 404 || outcome.status === 400) {
        return NextResponse.json(
          { error: "Knowledge base not found for this organisation." },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { error: "Knowledge base search is temporarily unavailable." },
        { status: 502 },
      );
    }
    const results = outcome.result.sources;

    // Opportunistic nonce sweep (best-effort, never blocks the tool call).
    void sweepExpiredNonces();

    // ── Response consumed by the vendor agent as tool output ────────────────
    return NextResponse.json({
      results: results.map((hit) => ({
        title: hit.title,
        snippet: hit.snippet,
        score: hit.score,
      })),
    });
  } catch (error) {
    console.error("[elevenlabs-tool] post:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// ─── Vendor post-call webhook ────────────────────────────────────────────────

export async function postElevenLabsPostCall(request: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await request.text();

    // ── Authenticity: vendor signature over the raw body ────────────────────
    const auth = verifyVendorWebhookSignature(rawBody, request.headers, getWebhookSecret());
    if (!auth.verified) {
      const status = auth.failure === "missing_secret" ? 503 : 401;
      return NextResponse.json({ error: `Webhook rejected (${auth.failure}).` }, { status });
    }

    await ensureMigrated();

    const payload = JSON.parse(rawBody || "{}") as Record<string, unknown>;
    // The vendor wraps post-call payloads in {data: …} on some schema
    // versions — accept both shapes.
    const data = (payload.data && typeof payload.data === "object" ? payload.data : payload) as Record<string, unknown>;

    const conversationId = typeof data.conversation_id === "string" ? data.conversation_id.trim() : "";
    const vendorAgentId = typeof data.agent_id === "string" ? data.agent_id.trim() : "";
    const status = typeof data.status === "string" ? data.status.trim() : "done";
    const language = typeof data.language === "string" ? data.language.trim() : null;

    if (!conversationId || !vendorAgentId) {
      return NextResponse.json(
        { error: "conversation_id and agent_id are required." },
        { status: 400 },
      );
    }

    // ── Tenant resolution: binding by vendor agent id ───────────────────────
    const bindings = await dbQuery<{
      id: string;
      org_id: string;
      agent_id: string;
      config_snapshot: unknown;
    }>(
      `SELECT id, org_id, agent_id, config_snapshot
         FROM elevenlabs_agents
        WHERE elevenlabs_agent_id = $1 AND mode = 'conversational'`,
      [vendorAgentId],
    );
    const binding = bindings[0];
    if (!binding) {
      // Unknown agent — acknowledge (so the vendor stops retrying) but store
      // nothing; no tenant to attribute the conversation to.
      return NextResponse.json({ received: true, matched: false });
    }

    const snapshot: Record<string, unknown> =
      binding.config_snapshot && typeof binding.config_snapshot === "object" && !Array.isArray(binding.config_snapshot)
        ? (binding.config_snapshot as Record<string, unknown>)
        : {};
    const kbId = typeof snapshot.kbId === "string" ? snapshot.kbId : null;

    // ── Timing: measured duration from the vendor's own timestamps ──────────
    const startedAt = parseTimestamp(data.started_at);
    const endedAt = parseTimestamp(data.ended_at);
    let durationSeconds: number | null = null;
    if (startedAt != null && endedAt != null && endedAt > startedAt) {
      durationSeconds = Math.round((endedAt - startedAt) / 1000);
    } else if (typeof data.duration === "number" && data.duration > 0) {
      durationSeconds = Math.round(data.duration);
    }

    // ── Transcript: PII-redacted BEFORE insert (§11.5) ───────────────────────
    const transcript = normaliseTranscript(data.transcript);

    // ── Persist: upsert on (org, conversation_id) — webhook retries and
    //    post-call/sync deliveries converge on one record.
    await dbQuery(
      `INSERT INTO elevenlabs_conversations
         (org_id, agent_mapping_id, conversation_id, agent_id, status,
          transcript, analysis, language, started_at, ended_at, duration_seconds, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12::jsonb)
       ON CONFLICT (org_id, conversation_id)
       DO UPDATE SET status = EXCLUDED.status,
                     transcript = EXCLUDED.transcript,
                     analysis = EXCLUDED.analysis,
                     language = EXCLUDED.language,
                     started_at = EXCLUDED.started_at,
                     ended_at = EXCLUDED.ended_at,
                     duration_seconds = EXCLUDED.duration_seconds,
                     metadata = EXCLUDED.metadata,
                     updated_at = now()`,
      [
        binding.org_id,
        binding.id,
        conversationId,
        vendorAgentId,
        status === "processing" || status === "failed" ? status : "done",
        JSON.stringify(transcript),
        JSON.stringify(safeObject(data.analysis)),
        language,
        startedAt != null ? new Date(startedAt).toISOString() : null,
        endedAt != null ? new Date(endedAt).toISOString() : null,
        durationSeconds,
        JSON.stringify({ source: "webhook" }),
      ],
    );

    // ── Metering: CONVERSATION minutes from measured duration (§12) ────────
    if (durationSeconds != null && durationSeconds > 0) {
      await logConversationUsage({
        orgId: binding.org_id,
        kbId,
        agentId: binding.agent_id,
        model: "conversational",
        durationSeconds,
      });
    }

    void sweepExpiredNonces();
    return NextResponse.json({ received: true, matched: true });
  } catch (error) {
    console.error("[elevenlabs-post-call] post:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function parseTimestamp(raw: unknown): number | null {
  if (typeof raw === "number" && raw > 0) return raw < 1e12 ? raw * 1000 : raw;
  if (typeof raw === "string" && !Number.isNaN(Date.parse(raw))) return Date.parse(raw);
  return null;
}

function safeObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

/**
 * Normalises the vendor transcript shape into the stored row shape, running
 * every text field through PII redaction. Turn bodies are kept (they ARE the
 * transcript) but emails/phones/cards are masked at write time — the same
 * discipline query_events applies.
 */
function normaliseTranscript(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  const turns: Array<Record<string, unknown>> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const turn = item as Record<string, unknown>;
    const textRaw = typeof turn.message === "string"
      ? turn.message
      : typeof turn.text === "string"
        ? turn.text
        : null;
    if (textRaw == null) continue;
    const redacted = redactText(textRaw);
    turns.push({
      role: typeof turn.role === "string" ? turn.role : "unknown",
      message: redacted.text,
      ...(typeof turn.time_in_call_secs === "number" ? { timeInCallSecs: turn.time_in_call_secs } : {}),
    });
  }
  return turns;
}

// ─── Admin: provision the vendor post-call webhook ──────────────────────────

/**
 * POST /api/admin/elevenlabs/webhooks — super-admin only.
 *
 * Creates (or re-creates) the ElevenLabs workspace webhook that delivers
 * post-call transcripts + analytics to
 * POST /api/webhooks/elevenlabs/post-call. The vendor GENERATES the signing
 * secret; it is persisted straight into platform_env_settings
 * (ELEVENLABS_WEBHOOK_SECRET) via setPlatformEnvSetting, which also updates
 * the live process.env — verification picks it up without a restart.
 *
 * Re-running creates a second webhook at the vendor (webhooks are
 * workspace-scoped and named); old ones can be removed from the ElevenLabs
 * dashboard. Idempotence is NOT attempted — provisioning is a rare,
 * audited, super-admin action.
 */
export async function postElevenLabsWebhookProvision(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(request);
    await requireSuperAdmin(auth);

    if (!isElevenLabsEnabled()) {
      return NextResponse.json(
        { error: "ElevenLabs is not enabled on this platform (missing API key or kill switch off)." },
        { status: 503 },
      );
    }

    const service = VoiceProviderFactory.getVoiceService();
    if (!isConversationalVoiceService(service)) {
      return NextResponse.json(
        { error: "Voice provider does not support Conversational AI webhooks." },
        { status: 501 },
      );
    }

    const url = appUrl("/api/webhooks/elevenlabs/post-call");
    const created = await service.createWorkspaceWebhook({
      name: "Clara post-call",
      url,
    });

    if (!created.webhookSecret) {
      // Created but the vendor did not return a secret — the operator must
      // copy it from the ElevenLabs dashboard into Settings → Platform → Env.
      return NextResponse.json({
        webhookId: created.webhookId,
        url,
        secretConfigured: false,
        warning:
          "The vendor did not return a signing secret. Copy it from the ElevenLabs dashboard into ELEVENLABS_WEBHOOK_SECRET.",
      });
    }

    await setPlatformEnvSetting("ELEVENLABS_WEBHOOK_SECRET", created.webhookSecret, auth.user.id);

    // Audit the provisioning (same ledger as Mode-B acknowledgement flips).
    await dbQuery(
      `INSERT INTO subscription_audit_log (org_id, actor_user_id, actor_label, action, metadata)
       VALUES (NULL, $1, 'admin', 'elevenlabs_post_call_webhook_provisioned', $2::jsonb)`,
      [auth.user.id, JSON.stringify({ webhookId: created.webhookId, url })],
    ).catch(() => { /* audit is best-effort — the secret is already live */ });

    return NextResponse.json({
      webhookId: created.webhookId,
      url,
      secretConfigured: true,
    });
  } catch (error) {
    console.error("[elevenlabs-webhook-provision] post:", error);
    if (error instanceof NextResponse) return error;
    if (error instanceof ElevenLabsError) {
      return NextResponse.json({ error: error.message }, { status: error.status >= 400 && error.status < 600 ? error.status : 502 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
