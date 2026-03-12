"use client";

import Link from "next/link";
import { ArrowRight, BrainCircuit, Building2, Database, Layers3 } from "lucide-react";
import { useOrgs } from "@/modules/admin-ui/hooks";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";

export default function AdminSettingsPage() {
  const { orgs, loading, error } = useOrgs();

  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-8">
      <AdminPageHeader
        icon={BrainCircuit}
        title="AI Control Center"
        description="Platform defaults still live in environment configuration. Inside the app, the controllable runtime surface now spans organisations, projects, and knowledge bases."
        breadcrumbs={[{ label: "Settings" }]}
        chips={[
          `${orgs.length} organisation${orgs.length === 1 ? "" : "s"}`,
          "Org AI policy",
          "KB runtime overrides",
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <GuideCard
          icon={Building2}
          title="Organisation Policy"
          description="Choose the default provider, approved models, voice allowlists, and org-level feature flags."
        />
        <GuideCard
          icon={Layers3}
          title="Project to KB Flow"
          description="Open an organisation, manage projects, then drill into the KB list to continue the full admin workflow."
        />
        <GuideCard
          icon={Database}
          title="KB Runtime Overrides"
          description="Override provider or model routing per KB, and reset back to inherited org defaults any time."
        />
        <GuideCard
          icon={ArrowRight}
          title="Reprocess After Embedding Changes"
          description="When you change embedding routing, reprocess that KB so stored vectors match the active provider and dimension."
        />
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
        <div className="flex items-center gap-3 mb-4">
          <BrainCircuit className="w-5 h-5 text-indigo-400" />
          <h2 className="font-semibold text-white">Resolution Order</h2>
        </div>
        <p className="text-sm text-white/40">
          Runtime selection resolves in this order: platform env defaults → org AI policy → KB runtime overrides → assistant config voice and generation settings.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            "Platform env defaults",
            "Org AI policy",
            "KB runtime overrides",
            "Assistant config runtime values",
          ].map((item) => (
            <span key={item} className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-xs text-white/60">
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
        <h2 className="font-semibold text-white">Operational Reminder</h2>
        <p className="mt-2 text-sm text-white/40 leading-6">
          Assistant identity changes are instant, but embedding-route changes are not. After switching embedding provider or model overrides, reprocess the affected KB documents before relying on retrieval quality.
        </p>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-6">
          <div>
            <h2 className="font-semibold text-white">Open an Organisation</h2>
            <p className="text-sm text-white/40 mt-1">
              Start at the org level, then continue into projects and KBs for the full management flow.
            </p>
          </div>
          <Link href="/orgs">
            <Button variant="outline">Go to Organisations</Button>
          </Link>
        </div>

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-20 rounded-2xl bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        )}

        {error && <p className="text-sm text-rose-400">{error}</p>}

        {!loading && !error && (
          <div className="grid gap-3">
            {orgs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
                <p className="font-medium text-white">No organisations yet</p>
                <p className="text-sm text-white/40 mt-1">Create an organisation to unlock the AI policy and KB management flow.</p>
                <Link href="/orgs" className="inline-flex mt-4">
                  <Button>Create Organisation</Button>
                </Link>
              </div>
            ) : (
              orgs.map((org) => (
                <div key={org.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-5 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-white">{org.name}</p>
                    <p className="text-xs text-white/35 font-mono">/{org.slug}</p>
                  </div>
                  <Link href={`/orgs/${org.id}`} className="inline-flex items-center gap-2 text-sm text-indigo-300 hover:text-indigo-200">
                    Open AI policy <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GuideCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-indigo-300" />
      </div>
      <h2 className="font-semibold text-white">{title}</h2>
      <p className="text-sm text-white/40 mt-2 leading-6">{description}</p>
    </div>
  );
}
