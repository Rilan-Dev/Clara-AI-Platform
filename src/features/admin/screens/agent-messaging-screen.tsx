"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowUpRight, CheckCircle2, Clock3, LoaderCircle, MessageCircle, RefreshCw, ShieldCheck, Unplug } from "lucide-react";

type PhoneCandidate = {
  businessId: string; businessName: string; wabaId: string; wabaName: string;
  phoneNumberId: string; displayPhoneNumber: string; verifiedName: string | null;
};
type ConnectionState = {
  connection: null | {
    id: string; wabaId: string; wabaName: string | null; phoneNumberId: string;
    displayPhoneNumber: string; verifiedName: string | null; status: string;
    webhookVerified: boolean; webhookVerifiedAt: string | null; lastWebhookAt: string | null;
    lastErrorCode: string | null; accessTokenExpiresAt: string | null; briefingRecipientPhone: string | null; briefingRecipientOptInAt: string | null; dailyBriefingLastSentOn: string | null; updatedAt: string;
  };
  webhook: { verified: boolean; lastEventAt: string | null };
  dailyBriefing: { enabled: boolean; ready: boolean; reason: string | null };
  pendingSelection: { id: string; candidates: PhoneCandidate[] } | null;
};

export default function AgentMessagingScreen() {
  const params = useParams<{ id: string; agentId: string }>();
  const orgId = params?.id;
  const agentId = params?.agentId;
  const [state, setState] = useState<ConnectionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientOptIn, setRecipientOptIn] = useState(false);

  const load = useCallback(async () => {
    if (!orgId || !agentId) return;
    setLoading(true);
    setError("");
    try {
      const search = new URLSearchParams(window.location.search);
      const session = search.get("session");
      const query = session ? `?session=${encodeURIComponent(session)}` : "";
      const response = await fetch(`/api/orgs/${encodeURIComponent(orgId)}/agents/${encodeURIComponent(agentId)}/messaging/connection${query}`, { cache: "no-store" });
      const data = await response.json() as ConnectionState & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load messaging status.");
      setState(data);
      setRecipientPhone(data.connection?.briefingRecipientPhone ?? "");
      setRecipientOptIn(Boolean(data.connection?.briefingRecipientOptInAt));
      const callbackStatus = search.get("whatsapp");
      if (callbackStatus === "select-phone") setNotice("Meta authorization succeeded. Select the business phone this agent should use.");
      else if (callbackStatus === "cancelled") setNotice("Meta authorization was cancelled.");
      else if (callbackStatus === "no-eligible-phone") setNotice("Meta authorization succeeded, but no eligible WhatsApp Business phone was returned.");
      else if (callbackStatus === "configuration-error") setNotice("WhatsApp OAuth is not fully configured on the Clara server.");
      else if (callbackStatus === "error") setNotice("WhatsApp authorization did not complete. You can safely try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load messaging status.");
    } finally {
      setLoading(false);
    }
  }, [orgId, agentId]);

  useEffect(() => { void load(); }, [load]);

  async function mutate(action: string, extra: Record<string, string | boolean> = {}) {
    if (!orgId || !agentId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/orgs/${encodeURIComponent(orgId)}/agents/${encodeURIComponent(agentId)}/messaging/connection`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await response.json() as { error?: string; authorizationUrl?: string; warning?: string; webhookSubscribed?: boolean };
      if (!response.ok) throw new Error(data.error || "WhatsApp connection request failed.");
      if (action === "connect" && data.authorizationUrl) {
        window.location.assign(data.authorizationUrl);
        return;
      }
      if (action === "select-phone") {
        window.history.replaceState({}, "", window.location.pathname);
        setNotice(data.warning || (data.webhookSubscribed ? "Phone connected. Waiting for the first verified webhook event before enabling daily briefings." : "Phone saved, but webhook subscription needs attention."));
      } else if (action === "subscribe") {
        setNotice(data.webhookSubscribed ? "Meta webhook subscription is active. Daily briefings remain locked until a signed webhook event is received." : "Meta could not confirm the webhook subscription. Check the Meta app configuration and retry.");
      } else if (action === "disconnect") {
        setNotice("WhatsApp Business was disconnected from this agent.");
      } else if (action === "save-briefing-recipient") {
        setNotice("Briefing recipient and opt-in saved. Enable daily briefing to include this agent in the scheduled job.");
      } else if (action === "clear-briefing-recipient") {
        setRecipientPhone("");
        setRecipientOptIn(false);
        setNotice("Briefing recipient and consent were cleared; daily briefing eligibility is disabled.");
      } else if (action === "enable-briefing") {
        setNotice("Daily briefing eligibility is enabled for this verified connection.");
      } else if (action === "disable-briefing") {
        setNotice("Daily briefing eligibility is disabled.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "WhatsApp connection request failed.");
    } finally {
      setBusy(false);
    }
  }

  const connection = state?.connection;
  const connected = Boolean(connection && connection.status === "active");
  const ready = Boolean(state?.dailyBriefing.ready);
  const statusLabel = !connection ? "Not connected" : connection.status !== "active" ? "Connection needs attention" : connection.webhookVerified ? "Connected · verified" : "Connected · awaiting webhook";

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Agent channels</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Messaging</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Connect one WhatsApp Business phone to this agent. Connection and readiness are read from Clara’s server, not browser state.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || busy} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh status
        </button>
      </header>

      {notice && <div role="status" className="rounded-lg border border-border bg-muted/40 p-3 text-sm">{notice}</div>}
      {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-start gap-4 border-b border-border p-5 md:p-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <MessageCircle className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">WhatsApp Business</h2>
              <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">Meta Cloud API</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">One active phone per agent, encrypted credentials, signed webhooks and durable message/delivery state.</p>
            {connection && <p className="mt-2 text-sm font-medium">{connection.displayPhoneNumber}{connection.verifiedName ? ` · ${connection.verifiedName}` : ""}</p>}
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${ready ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-emerald-500" : "bg-muted-foreground/70"}`} />
            {loading ? "Loading status…" : statusLabel}
          </span>
        </div>

        <div className="grid gap-6 p-5 md:grid-cols-[1fr_250px] md:p-6">
          <div className="space-y-4">
            <h3 className="font-medium">{connected ? "Business number" : "Connect a business number"}</h3>
            <p className="text-sm leading-6 text-muted-foreground">
              {connected
                ? `Connected to ${connection?.wabaName || "a WhatsApp Business Account"}. Inbound processing and daily briefings stay gated until a signed event verifies the webhook path.`
                : "Authorize Clara with Meta, then choose the WhatsApp Business Account and phone number to bind to this agent."}
            </p>
            {!connected && (
              <button type="button" onClick={() => void mutate("connect")} disabled={busy || loading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                Connect WhatsApp Business
              </button>
            )}
            {connected && !connection?.webhookVerified && (
              <button type="button" onClick={() => void mutate("subscribe")} disabled={busy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Retry webhook subscription
              </button>
            )}
            {connected && connection?.webhookVerified && (
              <div className="space-y-3 rounded-xl border border-border p-4">
                <h3 className="font-medium">Daily briefing recipient</h3>
                <label className="block space-y-1 text-sm">
                  <span className="font-medium">WhatsApp number (E.164)</span>
                  <input
                    type="tel" value={recipientPhone} onChange={(event) => { setRecipientPhone(event.target.value); setRecipientOptIn(false); }}
                    placeholder="+14155550123" autoComplete="tel"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                  <input type="checkbox" checked={recipientOptIn} onChange={(event) => setRecipientOptIn(event.target.checked)} className="mt-1" />
                  <span>I confirm this recipient has explicitly opted in to receive daily WhatsApp briefings.</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void mutate("save-briefing-recipient", { recipientPhone, optIn: recipientOptIn })}
                    disabled={busy || !recipientOptIn || !/^\+[1-9]\d{7,14}$/.test(recipientPhone.trim())}
                    className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Save recipient and consent
                  </button>
                  {connection.briefingRecipientOptInAt && (
                    <button
                      type="button"
                      onClick={() => { if (window.confirm("Clear the saved recipient and withdraw briefing consent?")) void mutate("clear-briefing-recipient"); }}
                      disabled={busy}
                      className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
                    >
                      Clear recipient / withdraw consent
                    </button>
                  )}
                </div>
              </div>
            )}
            {connected && (
              <button type="button" onClick={() => { if (window.confirm("Disconnect this WhatsApp phone from the agent?")) void mutate("disconnect"); }} disabled={busy} className="ml-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
                <Unplug className="h-4 w-4" /> Disconnect
              </button>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void mutate(state?.dailyBriefing.enabled ? "disable-briefing" : "enable-briefing")}
                disabled={busy || loading || !ready}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                title={!ready ? "A verified WhatsApp connection is required" : undefined}
              >
                {state?.dailyBriefing.enabled ? "Disable daily briefing" : "Enable daily briefing"}
              </button>
              {!ready && <span className="text-xs text-muted-foreground">Available after a signed webhook event verifies the connection.</span>}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">OAuth state is single-use and time-limited. Access tokens are encrypted server-side; they are never sent to the browser.</p>
            {state?.pendingSelection && (
              <div className="space-y-3 rounded-xl border border-border p-4">
                <h3 className="font-medium">Choose a WhatsApp Business phone</h3>
                <p className="text-sm text-muted-foreground">Select one phone to bind to this agent. Only accounts returned by Meta for this authorization are selectable.</p>
                {state.pendingSelection.candidates.map((candidate) => (
                  <div key={candidate.phoneNumberId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{candidate.displayPhoneNumber}</p>
                      <p className="text-xs text-muted-foreground">{candidate.businessName} · {candidate.wabaName}{candidate.verifiedName ? ` · ${candidate.verifiedName}` : ""}</p>
                    </div>
                    <button type="button" onClick={() => void mutate("select-phone", { sessionId: state.pendingSelection!.id, phoneNumberId: candidate.phoneNumberId })} disabled={busy || connected} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                      Use this phone
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="space-y-3 rounded-xl bg-muted/40 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Webhook health</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{state?.webhook.verified ? `Verified by a signed Meta event${state.webhook.lastEventAt ? ` · last event ${new Date(state.webhook.lastEventAt).toLocaleString()}` : ""}.` : "Waiting for a valid signed Meta webhook event. Invalid signatures are rejected."}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Message and delivery state</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Inbound message IDs and delivery updates are stored idempotently so Meta retries do not create duplicate records.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Daily briefing</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{!ready ? state?.dailyBriefing.reason || "Briefings are disabled until the connection, webhook, and recipient consent are verified." : state?.dailyBriefing.enabled ? "Enabled for this verified connection. The scheduled job runs daily at 03:00 UTC using the configured approved Meta template." : "Connection and recipient consent are verified. Enable briefing eligibility to include this agent in the scheduled job."}</p>
                {connection?.dailyBriefingLastSentOn && <p className="mt-1 text-xs text-muted-foreground">Last sent date (UTC): {connection.dailyBriefingLastSentOn}</p>}
              </div>
            </div>
            {connection?.lastErrorCode && <p className="rounded-md border border-amber-500/30 p-2 text-xs text-muted-foreground">Connection issue: {connection.lastErrorCode}</p>}
            <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-4">
              Meta developer app settings <ArrowUpRight className="h-3 w-3" />
            </a>
          </aside>
        </div>
      </section>
    </main>
  );
}
