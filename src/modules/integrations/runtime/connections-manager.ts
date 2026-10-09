import { credentialVault } from "./credential-vault";
import { assertIntegrationExecutionAuthorized } from "./execution-authorization";

/**
 * Allows integration actions to look up other integration connections.
 * Used by ~2% of actions that need cross-integration access.
 * Implements the Activepieces ConnectionsManager interface.
 *
 * Cross-integration credential lookup is an execution boundary too: an action
 * must not use this adapter to bypass platform enablement, plan entitlement,
 * organisation grants, or explicit agent grants for the requested integration.
 */
export class DoableConnectionsManager {
  constructor(
    private userId: string,
    private workspaceId: string,
    private agentId?: string,
  ) {}

  async get(key: string): Promise<unknown | null> {
    // key is typically the integration name (e.g. "slack").
    // Fail closed rather than returning a credential for an integration that
    // the current tenant/agent is not authorized to execute.
    await assertIntegrationExecutionAuthorized({
      integrationId: key,
      workspaceId: this.workspaceId,
      agentId: this.agentId,
    });

    const connection = await credentialVault.get(
      this.userId,
      key,
      this.workspaceId,
      this.agentId,
    );
    if (!connection) return null;
    return connection.credentials;
  }
}
