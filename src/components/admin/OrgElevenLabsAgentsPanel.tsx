"use client";

/**
 * src/components/admin/OrgElevenLabsAgentsPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Conversational AI (Mode B) management for an organisation — the opt-in
 * realtime ElevenLabs agent layer on top of the hybrid voice axis.
 *
 *   • Bindings list     — one vendor Conversational AI agent per Clara agent
 *   • Disclosure gate   — the §3.3 data-flow acknowledgement modal; sessions
 *                         are refused by the server until it is accepted
 *   • Conversation log  — post-call records (PII-redacted transcripts)
 *   • Voice studio      — clone (consent-gated) + design (flag-gated)
 *
 * Everything routes through platform endpoints (/api/admin/elevenlabs/*,
 * /api/voice/elevenlabs/*) — the vendor API key never reaches this page.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot, RefreshCw, ShieldAlert, Trash2, Phone, Wand2, CopyPlus, History,
} from "lucide-react";
import { apiUrl } from "@/lib/runtime";
import { withAuthHeaders } from "@/lib/client-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";

// ─── Types (API contracts) ───────────────────────────────────────────────────

type Binding = {
  id: string;
  orgId: string;
  agentId: string;
  elevenlabsAgentId: string;
  orgAcknowledgedDataFlow: boolean;
  enabled: boolean;
  configSnapshot: {
    name?: string;
    voiceId?: string;
    kbId?: string;
    systemPrompt?: string | null;
    firstMessage?: string | null;
    twilio?: { phoneNumbers: string[] } | null;
  };
  lastConversationSyncAt: string | null;
  createdAt: string;
};

type AgentOption = { id: string; name: string };
type KbOption = { id: string; name: string };
type VoiceOption = { voiceId: string; name: string; cloned: boolean };

type Conversation = {
  id: string;
  conversationId: string;
  status: string;
  language: string | null;
  startedAt: string | null;
  durationSeconds: number | null;
  transcript: { role?: string; message?: string }[];
};

type StatusFlags = {
  connected?: boolean;
  conversationalAI?: boolean;
  voiceCloning?: boolean;
  voiceDesign?: boolean;
  canUseInstantCloning?: boolean;
  tier?: string;
};

type Props = { orgId: string };

const MODE_B_DISCLOSURE = [
  "ElevenLabs runs the realtime conversation: its agent hears the user and speaks the replies.",
  "To answer questions, the agent calls Clara's own knowledge search per turn — only the question and short answer snippets cross to ElevenLabs during the call.",
  "Documents, files and knowledge bases NEVER leave this platform — they are never uploaded to ElevenLabs.",
  "Post-call transcripts are stored PII-redacted (emails, phones and card numbers masked), exactly like the text chat audit trail.",
  "The hybrid pipeline (Mode A) remains available at any time, and public embeds always use it.",
];

// ─── Component ───────────────────────────────────────────────────────────────

export function OrgElevenLabsAgentsPanel({ orgId }: Props) {
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [readiness, setReadiness] = useState<{ ready: boolean; reason?: string } | null>(null);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [flags, setFlags] = useState<StatusFlags>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Create form state.
  const [formAgentId, setFormAgentId] = useState("");
  const [formKbId, setFormKbId] = useState("");
  const [formKbs, setFormKbs] = useState<KbOption[]>([]);
  const [formVoiceId, setFormVoiceId] = useState("");
  const [formName, setFormName] = useState("");
  const [formSystemPrompt, setFormSystemPrompt] = useState("");
  const [formFirstMessage, setFormFirstMessage] = useState("");
  const [formTwilio, setFormTwilio] = useState("");
  const [formTelephony, setFormTelephony] = useState(false);
  const [creating, setCreating] = useState(false);

  // Acknowledgement modal state.
  const [ackTarget, setAckTarget] = useState<Binding | null>(null);
  const [ackConfirmed, setAckConfirmed] = useState(false);

  // Conversations + voice studio state.
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [syncingConversations, setSyncingConversations] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneName, setCloneName] = useState("");
  const [cloneConsentName, setCloneConsentName] = useState("");
  const [cloneConsentRelationship, setCloneConsentRelationship] = useState("");
  const [cloneConsentConfirmed, setCloneConsentConfirmed] = useState(false);
  const [cloneFile, setCloneFile] = useState<File | null>(null);
  const [cloning, setCloning] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const [designName, setDesignName] = useState("");
  const [designPrompt, setDesignPrompt] = useState("");
  const [designing, setDesigning] = useState(false);

  const voiceOptions = useMemo(() => voices, [voices]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [agentsRes, bindingsRes, voicesRes] = await Promise.all([
        fetch(apiUrl(`/api/orgs/${encodeURIComponent(orgId)}/agents`), { headers: withAuthHeaders() }),
        fetch(apiUrl(`/api/admin/elevenlabs/agents?orgId=${encodeURIComponent(orgId)}`), { headers: withAuthHeaders() }),
        fetch(apiUrl(`/api/voice/elevenlabs/voices?orgId=${encodeURIComponent(orgId)}`), { headers: withAuthHeaders() }),
      ]);
      const agentsData = await agentsRes.json().catch(() => ({})) as AgentOption[] | { agents?: AgentOption[] };
      const bindingsData = await bindingsRes.json().catch(() => ({})) as { agents?: Binding[]; readiness?: { ready: boolean; reason?: string } };
      const voicesData = await voicesRes.json().catch(() => ({})) as { voices?: VoiceOption[] };

      setAgents(Array.isArray(agentsData) ? agentsData : (agentsData.agents ?? []));
      setBindings(bindingsData.agents ?? []);
      setReadiness(bindingsData.readiness ?? null);
      setVoices(voicesData.voices ?? []);
    } catch (err) {
      toast.error("Could not load Conversational AI state", { description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(
        apiUrl(`/api/voice/elevenlabs/conversations?orgId=${encodeURIComponent(orgId)}&limit=10`),
        { headers: withAuthHeaders() },
      );
      const data = await res.json().catch(() => ({})) as { conversations?: Conversation[] };
      setConversations(data.conversations ?? []);
    } catch { /* history is optional chrome */ }
  }, [orgId]);

  useEffect(() => { void load(); void loadConversations(); }, [load, loadConversations]);

  useEffect(() => {
    // Status flags gate the studio sections (clone/design availability).
    void (async () => {
      try {
        const res = await fetch(apiUrl("/api/admin/elevenlabs/status"), { headers: withAuthHeaders() });
        const data = await res.json().catch(() => ({})) as StatusFlags;
        setFlags(data);
      } catch { /* flags default off */ }
    })();
  }, []);

  // KB options follow the selected agent.
  useEffect(() => {
    if (!formAgentId) { setFormKbs([]); return; }
    void (async () => {
      try {
        const res = await fetch(apiUrl(`/api/agents/${encodeURIComponent(formAgentId)}/kbs`), { headers: withAuthHeaders() });
        const data = await res.json().catch(() => ({})) as KbOption[] | { kbs?: KbOption[] };
        setFormKbs(Array.isArray(data) ? data : (data.kbs ?? []));
      } catch { setFormKbs([]); }
    })();
  }, [formAgentId]);

  // ─── Actions ───────────────────────────────────────────────────────────────

  async function createBinding() {
    if (!formAgentId || !formKbId || !formVoiceId || !formName.trim()) {
      toast.error("Agent, knowledge base, voice and name are required.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(apiUrl("/api/admin/elevenlabs/agents"), {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          orgId,
          agentId: formAgentId,
          kbId: formKbId,
          voiceId: formVoiceId,
          name: formName.trim(),
          systemPrompt: formSystemPrompt.trim() || null,
          firstMessage: formFirstMessage.trim() || null,
          language: null,
          telephony: formTelephony,
          orgAcknowledgedDataFlow: false, // set through the disclosure modal
          ...(formTwilio.trim()
            ? { twilio: { phoneNumbers: formTwilio.split(",").map((s) => s.trim()).filter(Boolean) } }
            : {}),
        }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; agent?: Binding };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success("Conversational AI agent created", {
        description: "Accept the data-flow disclosure to enable sessions for this agent.",
      });
      setShowCreate(false);
      setFormAgentId(""); setFormKbId(""); setFormVoiceId(""); setFormName("");
      setFormSystemPrompt(""); setFormFirstMessage(""); setFormTwilio(""); setFormTelephony(false);
      await load();
    } catch (err) {
      toast.error("Could not create the agent", { description: (err as Error).message });
    } finally {
      setCreating(false);
    }
  }

  async function acknowledgeDataFlow(binding: Binding, accept: boolean) {
    try {
      const res = await fetch(apiUrl(`/api/admin/elevenlabs/agents/${encodeURIComponent(binding.id)}?orgId=${encodeURIComponent(orgId)}`), {
        method: "PATCH",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ orgAcknowledgedDataFlow: accept }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success(accept ? "Data-flow disclosure accepted" : "Acknowledgement revoked", {
        description: accept
          ? "Mode-B sessions can now start for this agent."
          : "Mode-B sessions are blocked until the disclosure is accepted again.",
      });
      setAckTarget(null);
      setAckConfirmed(false);
      await load();
    } catch (err) {
      toast.error("Could not update the acknowledgement", { description: (err as Error).message });
    }
  }

  async function toggleBinding(binding: Binding, enabled: boolean) {
    try {
      const res = await fetch(apiUrl(`/api/admin/elevenlabs/agents/${encodeURIComponent(binding.id)}?orgId=${encodeURIComponent(orgId)}`), {
        method: "PATCH",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await load();
    } catch (err) {
      toast.error("Could not toggle the agent", { description: (err as Error).message });
    }
  }

  async function deleteBinding(binding: Binding) {
    if (!window.confirm(`Delete the Conversational AI agent "${binding.configSnapshot.name ?? binding.elevenlabsAgentId}"? The vendor agent is deleted too.`)) return;
    try {
      const res = await fetch(apiUrl(`/api/admin/elevenlabs/agents/${encodeURIComponent(binding.id)}?orgId=${encodeURIComponent(orgId)}`), {
        method: "DELETE",
        headers: withAuthHeaders(),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success("Conversational AI agent deleted");
      await load();
    } catch (err) {
      toast.error("Could not delete the agent", { description: (err as Error).message });
    }
  }

  async function syncConversations() {
    setSyncingConversations(true);
    try {
      const res = await fetch(apiUrl("/api/voice/elevenlabs/conversations/sync"), {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ orgId }),
      });
      const data = await res.json().catch(() => ({})) as { synced?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success("Conversation history synced", { description: `${data.synced ?? 0} new records.` });
      await loadConversations();
    } catch (err) {
      toast.error("Could not sync conversations", { description: (err as Error).message });
    } finally {
      setSyncingConversations(false);
    }
  }

  async function cloneVoice() {
    if (!cloneName.trim() || !cloneFile || !cloneConsentName.trim() || !cloneConsentRelationship.trim() || !cloneConsentConfirmed) {
      toast.error("Cloning requires a name, a reference audio file and a complete consent attestation.");
      return;
    }
    setCloning(true);
    try {
      const form = new FormData();
      form.append("orgId", orgId);
      form.append("name", cloneName.trim());
      form.append("consentConfirmed", "true");
      form.append("consentName", cloneConsentName.trim());
      form.append("consentRelationship", cloneConsentRelationship.trim());
      form.append("files", cloneFile, cloneFile.name);
      const res = await fetch(apiUrl("/api/voice/elevenlabs/voices/clone"), {
        method: "POST",
        headers: withAuthHeaders(),
        body: form,
      });
      const data = await res.json().catch(() => ({})) as { error?: string; voiceId?: string; requiresVerification?: boolean };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success("Voice cloned", {
        description: data.requiresVerification
          ? "The voice requires verification at ElevenLabs before production use."
          : "The cloned voice is in the org catalog.",
      });
      setCloneOpen(false);
      setCloneName(""); setCloneFile(null); setCloneConsentName(""); setCloneConsentRelationship(""); setCloneConsentConfirmed(false);
      await load();
    } catch (err) {
      toast.error("Could not clone the voice", { description: (err as Error).message });
    } finally {
      setCloning(false);
    }
  }

  async function designVoice() {
    if (!designName.trim() || !designPrompt.trim()) {
      toast.error("Voice Design needs a name and a description.");
      return;
    }
    setDesigning(true);
    try {
      const res = await fetch(apiUrl("/api/voice/elevenlabs/voices/design"), {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ orgId, name: designName.trim(), textPrompt: designPrompt.trim() }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; voiceId?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success("Voice designed", { description: "The generated voice is in the org catalog." });
      setDesignOpen(false);
      setDesignName(""); setDesignPrompt("");
      await load();
    } catch (err) {
      toast.error("Could not design the voice", { description: (err as Error).message });
    } finally {
      setDesigning(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Card className="border-border shadow-soft">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bot className="w-5 h-5 text-primary" />
          Conversational AI (Mode B)
        </CardTitle>
        <CardDescription>
          Opt-in realtime ElevenLabs agents for this organisation. Lower latency and natural
          turn-taking; knowledge stays grounded through Clara&apos;s own signed RAG bridge.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Readiness banner */}
        {readiness && !readiness.ready && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
            <ShieldAlert className="mt-0.5 h-4 w-4 text-amber-500" />
            <div className="text-xs text-amber-600">{readiness.reason}</div>
          </div>
        )}

        {/* Bindings */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Agent bindings</h3>
            <Button variant="outline" size="sm" onClick={() => setShowCreate((v) => !v)} disabled={loading}>
              {showCreate ? "Cancel" : "Bind an agent"}
            </Button>
          </div>

          {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {!loading && bindings.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No Clara agent is bound to a Conversational AI agent yet. The hybrid pipeline (Mode A)
              serves all voice conversations meanwhile.
            </p>
          )}

          {bindings.map((binding) => {
            const agentName = agents.find((a) => a.id === binding.agentId)?.name ?? binding.agentId;
            const voiceName = voices.find((v) => v.voiceId === binding.configSnapshot.voiceId)?.name ?? binding.configSnapshot.voiceId ?? "—";
            return (
              <div key={binding.id} className="rounded-xl border border-border bg-muted/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {binding.configSnapshot.name ?? "Unnamed agent"}
                      <span className="ml-2 text-xs text-muted-foreground">on {agentName}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      voice: {voiceName}
                      {binding.configSnapshot.twilio?.phoneNumbers?.length ? ` · Twilio: ${binding.configSnapshot.twilio.phoneNumbers.length} number(s)` : ""}
                      {` · vendor id ${binding.elevenlabsAgentId.slice(0, 8)}…`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {binding.orgAcknowledgedDataFlow
                      ? <Badge className="text-[10px]">Disclosure accepted</Badge>
                      : <Badge variant="destructive" className="text-[10px]">Disclosure required</Badge>}
                    <Switch checked={binding.enabled} onCheckedChange={(v) => void toggleBinding(binding, v)} />
                    <Button variant="ghost" size="sm" onClick={() => { setAckTarget(binding); setAckConfirmed(false); }}>
                      Disclosure
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void deleteBinding(binding)} aria-label="Delete binding">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Create form */}
          {showCreate && (
            <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/[0.03] p-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Clara agent</Label>
                  <Select value={formAgentId || undefined} onValueChange={(v) => { setFormAgentId(v); setFormKbId(""); }}>
                    <SelectTrigger><SelectValue placeholder="Pick an agent" /></SelectTrigger>
                    <SelectContent>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Knowledge base (RAG source)</Label>
                  <Select value={formKbId || undefined} onValueChange={setFormKbId} disabled={!formAgentId}>
                    <SelectTrigger><SelectValue placeholder={formAgentId ? "Pick a knowledge base" : "Pick an agent first"} /></SelectTrigger>
                    <SelectContent>
                      {formKbs.map((kb) => (
                        <SelectItem key={kb.id} value={kb.id}>{kb.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Voice</Label>
                  <Select value={formVoiceId || undefined} onValueChange={setFormVoiceId}>
                    <SelectTrigger><SelectValue placeholder="Pick a synced voice" /></SelectTrigger>
                    <SelectContent>
                      {voiceOptions.map((voice) => (
                        <SelectItem key={voice.voiceId} value={voice.voiceId}>
                          {voice.name}{voice.cloned ? " (cloned)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Agent name</Label>
                  <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Front desk — voice" />
                </div>
                <div className="space-y-2 lg:col-span-2">
                  <Label className="text-sm font-medium">System prompt (optional)</Label>
                  <Textarea
                    value={formSystemPrompt}
                    onChange={(e) => setFormSystemPrompt(e.target.value)}
                    placeholder="Persona instructions for the voice agent. Leave empty to let the knowledge base system prompt govern."
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">First message (optional)</Label>
                  <Input value={formFirstMessage} onChange={(e) => setFormFirstMessage(e.target.value)} placeholder="Spoken greeting when the session starts" />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Twilio phone numbers (optional)</Label>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <Input value={formTwilio} onChange={(e) => setFormTwilio(e.target.value)} placeholder="+15550001111, +919900000000" />
                  </div>
                  <p className="text-xs text-muted-foreground">Comma-separated. Binds the vendor agent to native telephony.</p>
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
                  <input
                    type="checkbox"
                    id="telephony-audio"
                    checked={formTelephony}
                    onChange={(e) => setFormTelephony(e.target.checked)}
                    className="mt-0.5"
                  />
                  <label htmlFor="telephony-audio" className="text-sm leading-snug">
                    Phone-ready audio (μ-law 8 kHz)
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      Optimises the agent for Twilio calls. Browser sessions still work — the web client
                      adapts to the agent&apos;s audio format automatically.
                    </span>
                  </label>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={createBinding} disabled={creating}>
                  {creating ? "Creating…" : "Create Conversational AI agent"}
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Conversation history */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Recent conversations</h3>
            </div>
            <Button variant="outline" size="sm" onClick={syncConversations} disabled={syncingConversations || bindings.length === 0}>
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${syncingConversations ? "animate-spin" : ""}`} />
              {syncingConversations ? "Syncing…" : "Sync history"}
            </Button>
          </div>
          {conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No Mode-B conversations recorded yet. Transcripts arrive PII-redacted through the signed post-call webhook.
            </p>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {conversations.map((conversation) => (
                <div key={conversation.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0 text-xs">
                    <span className="font-medium text-foreground">{conversation.conversationId.slice(0, 18)}…</span>
                    <span className="ml-2 text-muted-foreground">
                      {conversation.transcript.length} turns
                      {conversation.durationSeconds != null ? ` · ${Math.round(conversation.durationSeconds / 60)} min` : ""}
                      {conversation.language ? ` · ${conversation.language}` : ""}
                    </span>
                  </div>
                  <Badge variant={conversation.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">
                    {conversation.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Voice studio: clone + design (flag-gated) */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Voice studio</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-muted/10 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CopyPlus className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium text-foreground">Clone a voice</p>
                </div>
                {!flags.voiceCloning && <Badge variant="secondary" className="text-[10px]">Flag off</Badge>}
                {flags.voiceCloning && flags.canUseInstantCloning === false && <Badge variant="secondary" className="text-[10px]">Tier {flags.tier ?? "?"}</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Instant cloning from reference audio. Requires an explicit, recorded consent attestation.
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setCloneOpen((v) => !v)} disabled={!flags.voiceCloning}>
                {cloneOpen ? "Cancel" : "Clone voice"}
              </Button>
              {cloneOpen && (
                <div className="mt-3 space-y-3">
                  <Input value={cloneName} onChange={(e) => setCloneName(e.target.value)} placeholder="Voice name" />
                  <Input type="file" accept="audio/*" onChange={(e) => setCloneFile(e.target.files?.[0] ?? null)} />
                  <Input value={cloneConsentName} onChange={(e) => setCloneConsentName(e.target.value)} placeholder="Consenting person's full name" />
                  <Input value={cloneConsentRelationship} onChange={(e) => setCloneConsentRelationship(e.target.value)} placeholder="Your relationship to them (e.g. self, authorised rep)" />
                  <label className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Checkbox checked={cloneConsentConfirmed} onCheckedChange={(v) => setCloneConsentConfirmed(v === true)} className="mt-0.5" />
                    I confirm the named person has given explicit consent to clone their voice from the uploaded audio.
                  </label>
                  <Button size="sm" onClick={cloneVoice} disabled={cloning}>{cloning ? "Cloning…" : "Clone with consent"}</Button>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-muted/10 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium text-foreground">Design a voice</p>
                </div>
                {!flags.voiceDesign && <Badge variant="secondary" className="text-[10px]">Flag off</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Describe a voice in plain language; ElevenLabs generates it.
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setDesignOpen((v) => !v)} disabled={!flags.voiceDesign}>
                {designOpen ? "Cancel" : "Design voice"}
              </Button>
              {designOpen && (
                <div className="mt-3 space-y-3">
                  <Input value={designName} onChange={(e) => setDesignName(e.target.value)} placeholder="Voice name" />
                  <Textarea
                    value={designPrompt}
                    onChange={(e) => setDesignPrompt(e.target.value)}
                    placeholder="e.g. A calm middle-aged British male, warm and patient, slightly deep, speaking at a measured pace"
                    rows={3}
                  />
                  <Button size="sm" onClick={designVoice} disabled={designing}>{designing ? "Designing…" : "Generate voice"}</Button>
                </div>
              )}
            </div>
          </div>
        </section>
      </CardContent>

      {/* Disclosure modal (plan §3.3 acknowledgement) */}
      {ackTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              <h3 className="text-base font-semibold text-foreground">Data-flow disclosure — Conversational AI</h3>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Before realtime sessions can run on <b>{ackTarget.configSnapshot.name ?? "this agent"}</b>, the
              organisation must acknowledge exactly what crosses to ElevenLabs:
            </p>
            <ul className="mt-3 space-y-2">
              {MODE_B_DISCLOSURE.map((line) => (
                <li key={line} className="flex items-start gap-2 text-xs text-foreground/90">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  {line}
                </li>
              ))}
            </ul>
            <label className="mt-4 flex items-start gap-2 text-sm text-foreground">
              <Checkbox checked={ackConfirmed} onCheckedChange={(v) => setAckConfirmed(v === true)} className="mt-0.5" />
              I acknowledge this data flow on behalf of the organisation.
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setAckTarget(null); setAckConfirmed(false); }}>Close</Button>
              {ackTarget.orgAcknowledgedDataFlow && (
                <Button variant="outline" onClick={() => void acknowledgeDataFlow(ackTarget, false)}>Revoke</Button>
              )}
              <Button disabled={!ackConfirmed} onClick={() => void acknowledgeDataFlow(ackTarget, true)}>
                Accept &amp; enable sessions
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
