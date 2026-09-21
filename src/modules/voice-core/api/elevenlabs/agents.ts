/**
 * src/modules/voice-core/api/elevenlabs/agents.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Mode B (Conversational AI) agent mapping CRUD — platform-admin surface.
 *
 *   GET    /api/admin/elevenlabs/agents          — org's agent bindings
 *   POST   /api/admin/elevenlabs/agents          — create vendor agent + binding
 *   GET    /api/admin/elevenlabs/agents/[id]     — one binding
 *   PATCH  /api/admin/elevenlabs/agents/[id]     — update binding / vendor agent
 *   DELETE /api/admin/elevenlabs/agents/[id]     — delete vendor agent + binding
 *
 * Guard discipline (plan §6): every handler requires a super-admin session;
 * creation additionally requires BOTH Mode B flags — the platform kill
 * switch ELEVENLABS_ENABLED and the opt-in
 * ELEVENLABS_CONVERSATIONAL_AI_ENABLED — plus a configured
 * ELEVENLABS_TOOL_HMAC_SECRET, because the created vendor agent is
 * registered with the RAG server tool that authenticates against it.
 *
 * org_acknowledged_data_flow (the §3.3 disclosure acknowledgement) is
 * stored on the binding and audited; sessions are refused while it is
 * FALSE (see agent-session.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query as dbQuery } from "@/lib/db";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { appUrl } from "@/lib/stripe";
import { getToolHmacSecret, isConversationalAIEnabled, isElevenLabsEnabled, isValidUuid } from "../../model-catalog";
import { VoiceProviderFactory } from "../../factory";
import { ElevenLabsError } from "../../providers/elevenlabs";
import { isConversationalVoiceService } from "../../types";

export interface ElevenLabsAgentBindingRow {
  id: string;
  orgId: string;
  agentId: string;
  elevenlabsAgentId: string;
  mode: string;
  orgAcknowledgedDataFlow: boolean;
  enabled: boolean;
  configSnapshot: Record<string, unknown>;
  lastSyncedAt: string | null;
  lastConversationSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AgentBindingDbRow {
  id: string;
  org_id: string;
  agent_id: string;
  elevenlabs_agent_id: string;
  mode: string;
  org_acknowledged_data_flow: boolean;
  enabled: boolean;
  config_snapshot: unknown;
  last_synced_at: string | null;
  last_conversation_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapBindingRow(row: AgentBindingDbRow): ElevenLabsAgentBindingRow {
  const snapshot: Record<string, unknown> =
    row.config_snapshot && typeof row.config_snapshot === "object" && !Array.isArray(row.config_snapshot)
      ? (row.config_snapshot as Record<string, unknown>)
      : {};
  return {
    id: String(row.id),
    orgId: row.org_id,
    agentId: row.agent_id,
    elevenlabsAgentId: row.elevenlabs_agent_id,
    mode: row.mode,
    orgAcknowledgedDataFlow: Boolean(row.org_acknowledged_data_flow),
    enabled: Boolean(row.enabled),
    configSnapshot: snapshot,
    lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
    lastConversationSyncAt: row.last_conversation_sync_at ? String(row.last_conversation_sync_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Mode B availability gate shared by the mutating handlers + status UIs. */
export async function modeBReadiness(): Promise<{ ready: true } | { ready: false; reason: string; status: number }> {
  if (!(await isElevenLabsEnabled())) {
    return {
      ready: false,
      reason: "ElevenLabs is not enabled on this platform (disabled in Platform AI Settings or API key not configured).",
      status: 503,
    };
  }
  if (!isConversationalAIEnabled()) {
    return {
      ready: false,
      reason: "Conversational AI (Mode B) is disabled. Set ELEVENLABS_CONVERSATIONAL_AI_ENABLED=true to opt in.",
      status: 404,
    };
  }
  if (!getToolHmacSecret()) {
    return {
      ready: false,
      reason: "ELEVENLABS_TOOL_HMAC_SECRET is not configured — Mode-B agents cannot be created without it.",
      status: 503,
    };
  }
  return { ready: true };
}

async function loadBinding(id: string, orgId: string | null): Promise<ElevenLabsAgentBindingRow | null> {
  if (!isValidUuid(id)) return null;
  const rows = orgId
    ? await dbQuery<AgentBindingDbRow>(
        `SELECT * FROM elevenlabs_agents WHERE id = $1 AND org_id = $2`,
        [id, orgId],
      )
    : await dbQuery<AgentBindingDbRow>(`SELECT * FROM elevenlabs_agents WHERE id = $1`, [id]);
  return rows[0] ? mapBindingRow(rows[0]) : null;
}

// ─── GET: org's Mode-B agent bindings ────────────────────────────────────────

export async function getElevenLabsAgents(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(request);
    await requireSuperAdmin(auth);

    const url = new URL(request.url);
    const orgId = url.searchParams.get("orgId")?.trim() || null;

    const rows = orgId
      ? await dbQuery<AgentBindingDbRow>(
          `SELECT * FROM elevenlabs_agents WHERE org_id = $1 ORDER BY created_at DESC`,
          [orgId],
        )
      : await dbQuery<AgentBindingDbRow>(`SELECT * FROM elevenlabs_agents ORDER BY created_at DESC`);

    const readiness = modeBReadiness();
    return NextResponse.json({
      agents: rows.map(mapBindingRow),
      readiness: readiness.ready
        ? { ready: true }
        : { ready: false, reason: readiness.reason },
    });
  } catch (error) {
    console.error("[elevenlabs-agents] get:", error);
    if (error instanceof NextResponse) return error;
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// ─── POST: create vendor agent + org binding ─────────────────────────────────

export async function postElevenLabsAgents(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(request);
    await requireSuperAdmin(auth);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const orgId = typeof body.orgId === "string" ? body.orgId.trim() : null;
    const agentId = typeof body.agentId === "string" ? body.agentId.trim() : null;
    const kbId = typeof body.kbId === "string" ? body.kbId.trim() : null;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const voiceId = typeof body.voiceId === "string" ? body.voiceId.trim() : "";
    const systemPrompt = typeof body.systemPrompt === "string" && body.systemPrompt.trim() ? body.systemPrompt.trim() : null;
    const firstMessage = typeof body.firstMessage === "string" && body.firstMessage.trim() ? body.firstMessage.trim() : null;
    const language = typeof body.language === "string" && body.language.trim() ? body.language.trim() : null;
    const acknowledged = body.orgAcknowledgedDataFlow === true;

    if (!orgId || !agentId || !kbId || !name || !voiceId) {
      return NextResponse.json(
        { error: "orgId, agentId, kbId, name and voiceId are required." },
        { status: 400 },
      );
    }
    // UUID shape gate — malformed ids must 400, never reach the DB driver.
    if (!isValidUuid(orgId) || !isValidUuid(agentId) || !isValidUuid(kbId)) {
      return NextResponse.json(
        { error: "orgId, agentId and kbId must be UUIDs." },
        { status: 400 },
      );
    }

    const readiness = modeBReadiness();
    if (!readiness.ready) {
      return NextResponse.json({ error: readiness.reason }, { status: readiness.status });
    }

    // Tenant validation: the Clara agent and KB must belong to the org, and
    // the voice must be in the org's ElevenLabs catalog.
    const agentRows = await dbQuery<{ id: string }>(
      `SELECT id FROM agents WHERE id = $1 AND org_id = $2`,
      [agentId, orgId],
    );
    if (agentRows.length === 0) {
      return NextResponse.json({ error: "Agent not found in this organisation." }, { status: 404 });
    }
    const kbRows = await dbQuery<{ id: string }>(
      `SELECT kb.id FROM knowledge_bases kb JOIN agents a ON a.id = kb.agent_id
        WHERE kb.id = $1 AND a.org_id = $2`,
      [kbId, orgId],
    );
    if (kbRows.length === 0) {
      return NextResponse.json({ error: "Knowledge base not found in this organisation." }, { status: 404 });
    }
    const voiceRows = await dbQuery<{ voice_id: string }>(
      `SELECT voice_id FROM elevenlabs_voices WHERE org_id = $1 AND voice_id = $2
       UNION
       SELECT voice_id FROM organisation_voices WHERE org_id = $1 AND voice_id = $2 AND provider = 'elevenlabs'`,
      [orgId, voiceId],
    );
    if (voiceRows.length === 0) {
      return NextResponse.json(
        { error: "Voice is not in the organisation's ElevenLabs catalog. Sync voices first." },
        { status: 400 },
      );
    }

    // One binding per (org, agent) — the vendor agent is the voice surface.
    const existing = await dbQuery<{ id: string }>(
      `SELECT id FROM elevenlabs_agents WHERE org_id = $1 AND agent_id = $2`,
      [orgId, agentId],
    );
    if (existing.length > 0) {
      return NextResponse.json(
        { error: "This Clara agent already has a Mode-B binding. Update or delete it instead." },
        { status: 409 },
      );
    }

    const service = VoiceProviderFactory.getVoiceService();
    if (!isConversationalVoiceService(service)) {
      return NextResponse.json({ error: "Voice provider does not support Conversational AI." }, { status: 501 });
    }

    const twilio = parseTwilioParam(body.twilio);
    const telephony = body.telephony === true;

    const vendorAgent = await service.createConversationalAgent({
      name,
      voiceId,
      ragTool: {
        url: appUrl("/api/internal/elevenlabs/tools/rag-search"),
        secret: getToolHmacSecret() as string,
        orgId,
        agentId,
        kbId,
      },
      systemPrompt,
      firstMessage,
      language,
      telephony,
      twilio,
    });

    const inserted = await dbQuery<AgentBindingDbRow>(
      `INSERT INTO elevenlabs_agents
         (org_id, agent_id, elevenlabs_agent_id, org_acknowledged_data_flow,
          config_snapshot, enabled, last_synced_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, TRUE, now())
       RETURNING *`,
      [
        orgId,
        agentId,
        vendorAgent.agentId,
        acknowledged,
        JSON.stringify({
          name,
          voiceId,
          kbId,
          systemPrompt,
          firstMessage,
          language,
          telephony,
          twilio: twilio ?? null,
        }),
      ],
    );

    // Mode-B enablement is an audited admin action (plan §11.10).
    if (acknowledged) {
      await dbQuery(
        `INSERT INTO subscription_audit_log (org_id, actor_user_id, actor_label, action, metadata)
         VALUES ($1, $2, 'admin', 'elevenlabs_mode_b_acknowledged', $3::jsonb)`,
        [orgId, auth.user.id, JSON.stringify({ agentId, elevenlabsAgentId: vendorAgent.agentId, at: "creation" })],
      );
    }

    return NextResponse.json({ agent: mapBindingRow(inserted[0]) }, { status: 201 });
  } catch (error) {
    console.error("[elevenlabs-agents] post:", error);
    if (error instanceof NextResponse) return error;
    if (error instanceof ElevenLabsError) {
      return NextResponse.json({ error: error.message }, { status: error.status >= 400 && error.status < 600 ? error.status : 502 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// ─── GET one binding ─────────────────────────────────────────────────────────

export async function getElevenLabsAgentById(
  request: NextRequest,
  id: string,
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(request);
    await requireSuperAdmin(auth);

    const url = new URL(request.url);
    const orgId = url.searchParams.get("orgId")?.trim() || null;
    const binding = await loadBinding(id, orgId);
    if (!binding) {
      return NextResponse.json({ error: "Mode-B agent binding not found." }, { status: 404 });
    }
    return NextResponse.json({ agent: binding });
  } catch (error) {
    console.error("[elevenlabs-agent] get:", error);
    if (error instanceof NextResponse) return error;
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// ─── PATCH: update binding / vendor agent ────────────────────────────────────

export async function patchElevenLabsAgentById(
  request: NextRequest,
  id: string,
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(request);
    await requireSuperAdmin(auth);

    const url = new URL(request.url);
    const orgId = url.searchParams.get("orgId")?.trim() || null;
    const binding = await loadBinding(id, orgId);
    if (!binding) {
      return NextResponse.json({ error: "Mode-B agent binding not found." }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    // Binding-level toggles that never touch the vendor.
    if (body.enabled === true || body.enabled === false) {
      await dbQuery(`UPDATE elevenlabs_agents SET enabled = $1, updated_at = now() WHERE id = $2`, [
        body.enabled,
        binding.id,
      ]);
    }

    // The disclosure acknowledgement (plan §3.3): audited, one-way latch
    // semantics on the vendor side are not needed — but every flip is logged.
    if (body.orgAcknowledgedDataFlow === true || body.orgAcknowledgedDataFlow === false) {
      const ack = body.orgAcknowledgedDataFlow === true;
      await dbQuery(
        `UPDATE elevenlabs_agents SET org_acknowledged_data_flow = $1, updated_at = now() WHERE id = $2`,
        [ack, binding.id],
      );
      await dbQuery(
        `INSERT INTO subscription_audit_log (org_id, actor_user_id, actor_label, action, metadata)
         VALUES ($1, $2, 'admin', $3, $4::jsonb)`,
        [
          binding.orgId,
          auth.user.id,
          ack ? "elevenlabs_mode_b_acknowledged" : "elevenlabs_mode_b_acknowledgement_revoked",
          JSON.stringify({ bindingId: binding.id, agentId: binding.agentId }),
        ],
      );
    }

    // Vendor-side updates (name / voice / prompts / twilio) — needs Mode B ON.
    const vendorKeys = ["name", "voiceId", "systemPrompt", "firstMessage", "language", "twilio"];
    const hasVendorUpdate = vendorKeys.some((key) => body[key] !== undefined);
    if (hasVendorUpdate) {
      const readiness = modeBReadiness();
      if (!readiness.ready) {
        return NextResponse.json({ error: readiness.reason }, { status: readiness.status });
      }
      const service = VoiceProviderFactory.getVoiceService();
      if (!isConversationalVoiceService(service)) {
        return NextResponse.json({ error: "Voice provider does not support Conversational AI." }, { status: 501 });
      }

      const updated = await service.updateConversationalAgent(binding.elevenlabsAgentId, {
        ...(typeof body.name === "string" && body.name.trim() ? { name: body.name.trim() } : {}),
        ...(typeof body.voiceId === "string" && body.voiceId.trim() ? { voiceId: body.voiceId.trim() } : {}),
        ...(body.systemPrompt !== undefined
          ? { systemPrompt: typeof body.systemPrompt === "string" ? body.systemPrompt : null }
          : {}),
        ...(body.firstMessage !== undefined
          ? { firstMessage: typeof body.firstMessage === "string" ? body.firstMessage : null }
          : {}),
        ...(typeof body.language === "string" && body.language.trim() ? { language: body.language.trim() } : {}),
        ...(body.twilio !== undefined ? { twilio: parseTwilioParam(body.twilio) } : {}),
      });

      // Merge the new facts into the stored snapshot.
      const snapshot = {
        ...binding.configSnapshot,
        ...(typeof body.name === "string" && body.name.trim() ? { name: body.name.trim() } : {}),
        ...(typeof body.voiceId === "string" && body.voiceId.trim() ? { voiceId: body.voiceId.trim() } : {}),
        ...(body.systemPrompt !== undefined ? { systemPrompt: body.systemPrompt } : {}),
        ...(body.firstMessage !== undefined ? { firstMessage: body.firstMessage } : {}),
        ...(typeof body.language === "string" && body.language.trim() ? { language: body.language.trim() } : {}),
        ...(body.twilio !== undefined ? { twilio: parseTwilioParam(body.twilio) ?? null } : {}),
        ...(body.kbId !== undefined && typeof body.kbId === "string" ? { kbId: body.kbId.trim() } : {}),
      };
      await dbQuery(
        `UPDATE elevenlabs_agents
            SET config_snapshot = $1::jsonb, elevenlabs_agent_id = $2, last_synced_at = now(), updated_at = now()
          WHERE id = $3`,
        [JSON.stringify(snapshot), updated.agentId || binding.elevenlabsAgentId, binding.id],
      );
    }

    const refreshed = await loadBinding(binding.id, null);
    return NextResponse.json({ agent: refreshed });
  } catch (error) {
    console.error("[elevenlabs-agent] patch:", error);
    if (error instanceof NextResponse) return error;
    if (error instanceof ElevenLabsError) {
      return NextResponse.json({ error: error.message }, { status: error.status >= 400 && error.status < 600 ? error.status : 502 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// ─── DELETE: remove vendor agent + binding ───────────────────────────────────

export async function deleteElevenLabsAgentById(
  request: NextRequest,
  id: string,
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(request);
    await requireSuperAdmin(auth);

    const url = new URL(request.url);
    const orgId = url.searchParams.get("orgId")?.trim() || null;
    const binding = await loadBinding(id, orgId);
    if (!binding) {
      return NextResponse.json({ error: "Mode-B agent binding not found." }, { status: 404 });
    }

    // Delete at the vendor first — a dangling binding is recoverable, a
    // dangling vendor agent is invisible spend.
    if (await isElevenLabsEnabled()) {
      const service = VoiceProviderFactory.getVoiceService();
      if (isConversationalVoiceService(service)) {
        await service.deleteConversationalAgent(binding.elevenlabsAgentId);
      }
    }

    await dbQuery(`DELETE FROM elevenlabs_agents WHERE id = $1`, [binding.id]);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("[elevenlabs-agent] delete:", error);
    if (error instanceof NextResponse) return error;
    if (error instanceof ElevenLabsError) {
      return NextResponse.json({ error: error.message }, { status: error.status >= 400 && error.status < 600 ? error.status : 502 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function parseTwilioParam(raw: unknown): { phoneNumbers: string[]; attachPhoneNumbers?: boolean } | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const phoneNumbers = Array.isArray(value.phoneNumbers)
    ? value.phoneNumbers.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    : [];
  if (phoneNumbers.length === 0) return null;
  return { phoneNumbers, attachPhoneNumbers: value.attachPhoneNumbers === true };
}
