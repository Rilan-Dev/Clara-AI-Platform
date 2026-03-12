"use client";
import Link from "next/link";
import { useOrgs } from "@/modules/admin-ui/hooks";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const { orgs, loading, error } = useOrgs();

  return (
    <div className="p-8 max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground mb-2">AI Control Center</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Platform defaults still come from deployment environment variables. The editable controls inside the app now live at the organisation and knowledge-base levels.
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <InfoCard
          title="1. Organisation AI Policy"
          description="Set the default provider, allowed providers, approved models, voice allowlists, token caps, and feature flags for an org."
        />
        <InfoCard
          title="2. KB Overrides"
          description="Override provider or models for a specific knowledge base, or disable voice/public embed without changing the rest of the org."
        />
        <InfoCard
          title="3. Reprocess After Embedding Changes"
          description="If you change an embedding model override, reprocess that KB's documents so stored vectors match the new dimension and provider."
        />
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <h2 className="text-lg font-semibold text-foreground">Resolution Order</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Requests resolve AI configuration in this order: platform env defaults → organisation AI policy → KB runtime overrides → assistant config runtime values.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {[
            "Platform env defaults",
            "Org AI policy",
            "KB runtime overrides",
            "Assistant voice + generation config",
          ].map((item) => (
            <span key={item} className="rounded-full border border-border bg-muted/20 px-3 py-1 text-muted-foreground">
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Open an Organisation</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Start here to edit org-level AI controls, then drill into a project and KB for assistant or runtime overrides.
            </p>
          </div>
          <Link href="/admin/orgs">
            <Button variant="outline">Manage Organisations</Button>
          </Link>
        </div>

        {loading && (
          <div className="mt-6 space-y-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-20 rounded-xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        )}

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        {!loading && !error && (
          <div className="mt-6 grid gap-3">
            {orgs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 px-5 py-10 text-center">
                <p className="font-medium text-foreground">No organisations yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create an organisation first, then open it to configure AI policy.
                </p>
                <Link href="/admin/orgs" className="mt-4 inline-flex">
                  <Button>Create First Organisation</Button>
                </Link>
              </div>
            ) : (
              orgs.map((org) => (
                <div key={org.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/10 px-5 py-4">
                  <div>
                    <p className="font-medium text-foreground">{org.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">/{org.slug}</p>
                  </div>
                  <Link href={`/admin/orgs/${org.id}`}>
                    <Button variant="outline" size="sm">Open AI Policy</Button>
                  </Link>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function InfoCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}
