/**
 * Widget appearance is stored on the agent's assistant configuration, not the
 * knowledge base. A KB identifies its owning agent before mounting the editor.
 */
export function widgetDesignConfigUrl(agentId: string): string {
  return `/api/agents/${encodeURIComponent(agentId)}/config`;
}
