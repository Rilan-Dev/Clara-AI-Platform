"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, CreditCard, KeyRound, Settings2, ChevronRight } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { EmbedApiKeyPanel } from "@/components/admin/EmbedApiKeyPanel";
import { PaymentGatewayPanel } from "@/components/admin/PaymentGatewayPanel";

type Tab = "embed" | "payments" | "advanced";

export default function AdminSettingsPage() {
  const [tab, setTab] = useState<Tab>("embed");

  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-8">
      <AdminPageHeader
        icon={Settings2}
        title="Platform Settings"
        description="Manage landing embed key, payment gateway credentials, and platform-level configuration. Changes take effect immediately — no restart required."
        breadcrumbs={[{ label: "Settings" }]}
        chips={["Platform only", "Live runtime config", "Payments"]}
      />

      {/* Quick info cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <button
          onClick={() => setTab("embed")}
          className={`rounded-2xl border p-5 text-left transition-all ${
            tab === "embed"
              ? "border-indigo-500/30 bg-indigo-500/[0.06]"
              : "border-white/[0.08] bg-white/[0.03] hover:border-white/[0.15]"
          }`}
        >
          <KeyRound className="w-5 h-5 text-indigo-300 mb-3" />
          <h2 className="font-semibold text-white">Landing Embed Key</h2>
          <p className="text-sm text-white/40 mt-2">
            Configure the public landing-page embed API key used by the chat widget.
          </p>
        </button>

        <button
          onClick={() => setTab("payments")}
          className={`rounded-2xl border p-5 text-left transition-all ${
            tab === "payments"
              ? "border-emerald-500/30 bg-emerald-500/[0.06]"
              : "border-white/[0.08] bg-white/[0.03] hover:border-white/[0.15]"
          }`}
        >
          <CreditCard className="w-5 h-5 text-emerald-300 mb-3" />
          <h2 className="font-semibold text-white">Payment Gateways</h2>
          <p className="text-sm text-white/40 mt-2">
            Switch between Stripe (USD) and Razorpay (INR). Configure keys, secrets, and webhook endpoints.
          </p>
        </button>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
          <Building2 className="w-5 h-5 text-violet-300 mb-3" />
          <h2 className="font-semibold text-white">Organisation Profiles</h2>
          <p className="text-sm text-white/40 mt-2">
            Manage names and profile metadata. Only aggregate project and KB counts are visible at platform level.
          </p>
          <Link href="/orgs" className="inline-flex mt-4">
            <Button variant="outline" size="sm">
              Manage Profiles <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Active panel */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
        {tab === "embed" && <EmbedApiKeyPanel />}
        {tab === "payments" && <PaymentGatewayPanel />}
      </div>
    </div>
  );
}
