"use client";

/**
 * src/features/admin/screens/org-settings-screen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Organisation settings — profile details (moved off the main org page),
 * workspace facts and workspace guide links.
 *
 * The org page itself stays action-focused; everything "configuration"
 * lives here, exactly where people expect to find it.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Building2, Settings2, Info } from "lucide-react";
import { useAuth, useOrg } from "@/modules/admin-ui/hooks";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { EditOrgPanel } from "@/components/admin/EditOrgPanel";

export default function OrgSettingsScreen() {
  const { id = "" } = useParams<{ id: string }>();
  const { user }    = useAuth();
  const isAdmin     = user?.isSuperAdmin ?? false;
  const { data: org } = useOrg(id);

  const [editedOrg, setEditedOrg] = useState<{ name: string; slug: string; logoUrl?: string | null } | null>(null);

  useEffect(() => { setEditedOrg(null); }, [id]);

  const displayName = editedOrg?.name ?? org?.name  ?? "Organisation";
  const displaySlug = editedOrg?.slug ?? org?.slug  ?? "";

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        icon={Settings2}
        title="Organisation settings"
        description="Your organisation's public profile — name, web address and logo."
        breadcrumbs={isAdmin ? [{ label: "Organisations", href: "/orgs" }, { label: "Settings" }] : undefined}
      />

      {/* Org profile — the "Organisation Details" editor, now in its proper home */}
      <EditOrgPanel
        org={{ id, name: displayName, slug: displaySlug, logoUrl: editedOrg?.logoUrl ?? org?.logoUrl ?? null }}
        isSuperAdmin={isAdmin}
        onSaved={(updated) => setEditedOrg(updated)}
      />

      {/* Workspace facts */}
      <div className="mt-4 sm:mt-6 border border-white/[0.08] bg-white/[0.03] rounded-2xl p-4 sm:p-6">
        <h2 className="font-semibold text-white flex items-center gap-2 mb-4">
          <Info className="w-4 h-4 text-cyan-400" /> Workspace facts
        </h2>
        <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
          <div className="flex justify-between sm:block">
            <dt className="text-xs text-white/40">Organisation ID</dt>
            <dd className="text-sm text-white/70 font-mono text-right sm:text-left sm:mt-0.5 truncate">{id}</dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-xs text-white/40">Public URL</dt>
            <dd className="text-sm text-white/70 text-right sm:text-left sm:mt-0.5">
              /{displaySlug || "—"}
            </dd>
          </div>
          {org?.createdAt && (
            <div className="flex justify-between sm:block">
              <dt className="text-xs text-white/40">Created</dt>
              <dd className="text-sm text-white/70 text-right sm:text-left sm:mt-0.5">
                {new Date(org.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Guide links — where people expect related settings to live */}
      <div className="mt-4 sm:mt-6 grid sm:grid-cols-3 gap-3">
        {[
          { href: `/orgs/${id}/members`,  title: "Team & roles",    desc: "Invite teammates and set access levels" },
          { href: `/orgs/${id}/billing`,  title: "Billing & plan",  desc: "Plan, renewal and invoices" },
          { href: "/settings/account",    title: "Your account",    desc: "Profile, password and sessions" },
        ].map((item) => (
          <Link key={item.href} href={item.href}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5 hover:bg-white/[0.05] hover:border-indigo-500/25 transition-all group">
            <p className="text-sm font-medium text-white group-hover:text-indigo-300 transition-colors">{item.title}</p>
            <p className="text-xs text-white/35 mt-0.5">{item.desc}</p>
          </Link>
        ))}
      </div>

      {isAdmin && (
        <p className="mt-6 text-xs text-white/25 flex items-center gap-2">
          <Building2 className="w-3.5 h-3.5" />
          Platform-admin view · direct plan changes live on the Billing tab
        </p>
      )}
    </div>
  );
}
