"use client";

/**
 * src/features/admin/screens/org-agents-screen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Agents tab of the org workspace — create, open and delete agents.
 * (Extracted from the old org detail page so the Overview stays
 * monitoring-focused and agents get their own dedicated home.)
 */

import { useParams } from "next/navigation";
import { Bot } from "lucide-react";
import { useAuth, useAgents } from "@/modules/admin-ui/hooks";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AgentsSection } from "@/components/admin/AgentsSection";

export default function OrgAgentsScreen() {
  const { id = "" } = useParams<{ id: string }>();
  const { user }    = useAuth();
  const isAdmin     = user?.isSuperAdmin ?? false;

  const { agents, loading, create, remove } = useAgents(id);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        icon={Bot}
        title="Agents"
        description="Each agent groups knowledge bases and carries its own assistant configuration — language, voice and behaviour."
        breadcrumbs={isAdmin ? [{ label: "Organisations", href: "/orgs" }, { label: "Agents" }] : undefined}
      />

      <AgentsSection
        orgId={id}
        agents={agents}
        loading={loading}
        create={create}
        remove={remove}
      />
    </div>
  );
}
