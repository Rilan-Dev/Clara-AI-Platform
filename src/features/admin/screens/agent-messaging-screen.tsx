"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { ArrowUpRight, CheckCircle2, Clock3, MessageCircle, ShieldCheck } from "lucide-react";

const META_WHATSAPP_MANAGER = "https://business.facebook.com/latest/whatsapp_manager/phone_numbers";

export default function AgentMessagingScreen() {
  const { id = "", agentId = "" } = useParams<{ id: string; agentId: string }>();
  const [showSetup, setShowSetup] = useState(false);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Agent channels</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Messaging</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Connect a business messaging channel to this agent. Each agent can use one WhatsApp Business phone number.
        </p>
      </header>

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
            <p className="mt-1 text-sm text-muted-foreground">
              One WhatsApp Business phone per agent, with verified webhooks and durable message state.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70" />
            Not connected
          </span>
        </div>

        <div className="grid gap-6 p-5 md:grid-cols-[1fr_250px] md:p-6">
          <div className="space-y-4">
            <h3 className="font-medium">Connect a business number</h3>
            <p className="text-sm leading-6 text-muted-foreground">
              Start in Meta Business Manager to select the business and phone number you want to use. The number must be eligible for the WhatsApp Business Platform.
            </p>
            <button
              type="button"
              onClick={() => setShowSetup(true)}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Connect WhatsApp Business
            </button>
            <p className="text-xs leading-5 text-muted-foreground">
              You’ll keep this agent workspace open while you prepare the Meta business account.
            </p>
          </div>

          <aside className="space-y-3 rounded-xl bg-muted/40 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Verified webhooks</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Inbound events must pass Meta’s verification challenge and signature checks.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Durable message state</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Delivery and inbound-message status should survive refreshes and retries.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Daily briefing</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Scheduled summaries can be delivered after a number is connected.</p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {showSetup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSetup(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="whatsapp-setup-title" className="w-full max-w-lg rounded-2xl border border-border bg-background p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="whatsapp-setup-title" className="text-lg font-semibold">Start WhatsApp Business setup</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Open Meta Business Manager and confirm that the business and phone number are ready for the WhatsApp Business Platform.</p>
              </div>
              <button type="button" onClick={() => setShowSetup(false)} className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted" aria-label="Close setup dialog">✕</button>
            </div>
            <ol className="my-5 list-decimal space-y-2 pl-5 text-sm leading-6">
              <li>Select the Meta business portfolio and WhatsApp Business Account.</li>
              <li>Confirm the phone number and required business verification.</li>
              <li>Return to Clara to finish authorization and verify webhook delivery.</li>
            </ol>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-muted-foreground">
              Connection handoff is not yet backed by a Clara-side Meta OAuth/webhook endpoint. Opening Meta does not connect a number or change this status; the server-side connection flow must be completed before messages or daily briefings can be enabled.
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setShowSetup(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
              <a href={META_WHATSAPP_MANAGER} target="_blank" rel="noreferrer" onClick={() => setShowSetup(false)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                Open Meta Business Manager <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
