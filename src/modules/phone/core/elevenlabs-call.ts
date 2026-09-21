/**
 * src/modules/phone/core/elevenlabs-call.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * ElevenLabs Agents telephony resolution (phone voice_engine = 'elevenlabs').
 *
 * The register-call pattern (vendor docs, "Register Twilio calls"):
 *   1. Twilio calls POST /api/phone/twilio/incoming (voice webhook)
 *   2. Clara resolves the KB's Mode-B agent binding + re-applies every
 *      Mode-B gate (platform flags, binding enabled, org acknowledgement)
 *   3. Clara calls POST /v1/convai/twilio/register-call and returns the
 *      vendor's TwiML verbatim — audio then flows Twilio ⇄ ElevenLabs
 *      directly (sub-second turns; Clara is never in the audio path)
 *   4. Transcripts/analytics land through the signed post-call webhook
 *      (/api/webhooks/elevenlabs/post-call) — same as web Mode-B sessions
 *
 * The KB's RAG grounding happens through the agent's clara_rag_search
 * server tool, so phone answers use the same knowledge base as chat.
 */
import { query as dbQuery } from "@/lib/db";
import {
  isConversationalAIEnabled,
  isElevenLabsEnabled,
} from "@/modules/voice-core/model-catalog";
import { VoiceProviderFactory } from "@/modules/voice-core/factory";
import { isConversationalVoiceService } from "@/modules/voice-core/types";
import { ElevenLabsError } from "@/modules/voice-core/providers/elevenlabs";
import { insertCallLog } from "./db";
import type { PhoneCallConfig } from "./types";

export type ElevenLabsCallResolution =
  | { ok: true; vendorAgentId: string; orgId: string }
  | { ok: false; reason: string; status: number };

/** Resolves the active Mode-B binding for a KB (all gates re-applied). */
export async function resolveElevenLabsCallBinding(
  kbId: string,
): Promise<ElevenLabsCallResolution> {
  if (!(await isElevenLabsEnabled()) || !isConversationalAIEnabled()) {
    return {
      ok: false,
      status: 503,
      reason: "ElevenLabs Agents are not enabled on this platform.",
    };
  }

  const rows = await dbQuery<{
    org_id: string;
    agent_id: string;
    elevenlabs_agent_id: string;
    enabled: boolean;
    org_acknowledged_data_flow: boolean;
  }>(
    `SELECT a.org_id, a.id AS agent_id, ea.elevenlabs_agent_id,
            ea.enabled, ea.org_acknowledged_data_flow
       FROM knowledge_bases kb
       JOIN agents a ON a.id = kb.agent_id
       JOIN elevenlabs_agents ea ON ea.org_id = a.org_id AND ea.agent_id = a.id
      WHERE kb.id = $1 AND ea.mode = 'conversational'`,
    [kbId],
  );
  const binding = rows[0];
  if (!binding) {
    return {
      ok: false,
      status: 404,
      reason: "No Conversational AI agent is bound to this assistant (Settings → AI Providers).",
    };
  }
  if (!binding.enabled) {
    return { ok: false, status: 403, reason: "The Conversational AI agent binding is disabled." };
  }
  if (!binding.org_acknowledged_data_flow) {
    return {
      ok: false,
      status: 403,
      reason: "Mode B requires the organisation to acknowledge the disclosed data flow.",
    };
  }
  return { ok: true, vendorAgentId: binding.elevenlabs_agent_id, orgId: binding.org_id };
}

/**
 * Registers an inbound (or outbound-leg) Twilio call with the vendor agent
 * and returns the TwiML Twilio should execute. Also opens a phone_call_logs
 * row so the call is visible in the KB's call history; the transcript is
 * filled asynchronously by the post-call webhook.
 */
export async function connectCallViaElevenLabsAgent(params: {
  config: PhoneCallConfig;
  callSid: string;
  fromNumber: string;
  toNumber: string;
  direction?: "inbound" | "outbound";
}): Promise<{ ok: true; twiml: string } | { ok: false; reason: string; status: number }> {
  const { config, callSid, fromNumber, toNumber, direction = "inbound" } = params;

  const binding = await resolveElevenLabsCallBinding(config.kbId);
  if (!binding.ok) return binding;

  const service = VoiceProviderFactory.getVoiceService();
  if (!isConversationalVoiceService(service)) {
    return { ok: false, status: 501, reason: "Voice provider does not support Conversational AI." };
  }

  // Fire-and-forget log row: the call EXISTS even if the register call below
  // fails; the vendor conversation id arrives later via the post-call webhook.
  void insertCallLog({
    configId: config.id,
    kbId: config.kbId,
    provider: config.provider,
    callSid,
    fromNumber: fromNumber || null,
    toNumber: toNumber || config.phoneNumber,
    direction,
  }).catch(() => {});

  try {
    const twiml = await service.registerTwilioCall({
      agentId: binding.vendorAgentId,
      fromNumber: fromNumber || toNumber,
      toNumber: toNumber || fromNumber,
      direction,
      dynamicVariables: fromNumber ? { caller_number: fromNumber } : {},
    });
    return { ok: true, twiml };
  } catch (error) {
    const reason = error instanceof ElevenLabsError
      ? `Agent call registration failed (${error.status}).`
      : "Agent call registration failed.";
    console.error("[phone/elevenlabs] register-call:", error);
    return { ok: false, status: 502, reason };
  }
}
