import AgentsWorkspaceShell from "@/features/admin/screens/agent-workspace/workspace-shell";

/**
 * src/app/(admin)/orgs/[id]/agents/layout.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * ElevenLabs-style agents workspace layout. Wraps both the agents index
 * (/orgs/[id]/agents) and every agent workspace tab
 * (/orgs/[id]/agents/[agentId]/**):
 *
 *   · no agent selected  → sidebar lists agents + knowledge bases
 *   · agent selected     → sidebar switches to that agent's workspace tabs
 *   · navbar carries Versions/Publish only when an agent is selected
 */

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return <AgentsWorkspaceShell>{children}</AgentsWorkspaceShell>;
}
