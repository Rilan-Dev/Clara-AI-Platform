import { redirect } from "next/navigation";

/**
 * /orgs/[id]/integrations — retired organisation-level integrations screen.
 *
 * Organisation admins now connect credentials and enable integrations directly
 * on each agent's Integrations screen (MCP servers moved to the agent's
 * "MCP tools" screen), so there is no organisation-wide catalogue to manage.
 * Old bookmarks are forwarded to the agents list.
 */
export default async function OrgIntegrationsRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/orgs/${id}/agents`);
}
