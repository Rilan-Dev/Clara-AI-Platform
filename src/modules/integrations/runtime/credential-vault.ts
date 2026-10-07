import { query } from "@/lib/db";
import { ENCRYPTION_KEY } from "@/lib/secrets";

export type ClaraConnection = {
  id: string; org_id: string; agent_id: string | null; user_id: string | null;
  integration_id: string; auth_type: string; credentials: unknown; status: string;
  display_name: string | null; metadata: Record<string, unknown>;
};

export const credentialVault = {
  async hasActiveConnection(userId: string, integrationId: string, orgId: string, agentId?: string): Promise<boolean> {
    const rows = await query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1
           FROM integration_connections
          WHERE org_id=$1 AND integration_id=$2 AND status='active'
            AND (agent_id=$3 OR agent_id IS NULL)
            AND (user_id=$4 OR user_id IS NULL)
       ) AS exists`,
      [orgId, integrationId, agentId ?? null, userId || null],
    );
    return rows[0]?.exists === true;
  },
  async get(userId: string, integrationId: string, orgId: string, agentId?: string): Promise<ClaraConnection | null> {
    const rows = await query<ClaraConnection & { credentials_decrypted: string }>(
      `SELECT id,org_id,agent_id,user_id,integration_id,auth_type,status,display_name,metadata,
              pgp_sym_decrypt(credentials_encrypted,$1) AS credentials_decrypted
         FROM integration_connections
        WHERE org_id=$2 AND integration_id=$3 AND status='active'
          AND (agent_id=$4 OR agent_id IS NULL)
          AND (user_id=$5 OR user_id IS NULL)
        ORDER BY CASE WHEN agent_id=$4 THEN 0 ELSE 1 END, updated_at DESC
        LIMIT 1`,
      [ENCRYPTION_KEY, orgId, integrationId, agentId ?? null, userId || null],
    );
    const row = rows[0];
    if (!row) return null;
    return { ...row, credentials: JSON.parse(row.credentials_decrypted) };
  },
  async decrypt(
    connectionId: string,
    orgId: string,
    userId?: string,
    agentId?: string,
  ): Promise<unknown> {
    const rows = await query<{credentials_decrypted:string}>(
      `SELECT pgp_sym_decrypt(credentials_encrypted,$1) AS credentials_decrypted
         FROM integration_connections
        WHERE id=$2 AND org_id=$3 AND status='active'
          AND ($4::uuid IS NULL OR user_id=$4 OR user_id IS NULL)
          AND ($5::uuid IS NULL OR agent_id=$5 OR agent_id IS NULL)
        LIMIT 1`,
      [ENCRYPTION_KEY, connectionId, orgId, userId ?? null, agentId ?? null],
    );
    return rows[0] ? JSON.parse(rows[0].credentials_decrypted) : null;
  },
  async updateStatus(
    connectionId: string,
    orgId: string,
    status: string,
    userId?: string,
    agentId?: string,
  ): Promise<void> {
    // Status transitions initiated by the runner are terminal-state cleanup
    // (for example OAuth expiry). Never overwrite an explicit disable/disconnect
    // performed concurrently by the tenant/admin.
    await query(
      `UPDATE integration_connections
          SET status=$1,updated_at=now()
        WHERE id=$2 AND org_id=$3 AND status='active'
          AND ($4::uuid IS NULL OR user_id=$4 OR user_id IS NULL)
          AND ($5::uuid IS NULL OR agent_id=$5 OR agent_id IS NULL)`,
      [status,connectionId,orgId,userId ?? null,agentId ?? null],
    );
  },
  async updateCredentials(
    connectionId: string,
    orgId: string,
    credentials: unknown,
    userId?: string,
    agentId?: string,
  ): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `UPDATE integration_connections
          SET credentials_encrypted=pgp_sym_encrypt($1,$2), status='active', updated_at=now()
        WHERE id=$3 AND org_id=$4 AND status='active'
          AND ($5::uuid IS NULL OR user_id=$5 OR user_id IS NULL)
          AND ($6::uuid IS NULL OR agent_id=$6 OR agent_id IS NULL)
        RETURNING id`,
      [JSON.stringify(credentials), ENCRYPTION_KEY, connectionId, orgId, userId ?? null, agentId ?? null],
    );
    return rows.length > 0;
  },
};