import { query } from "@/lib/db";
import { ENCRYPTION_KEY } from "@/lib/secrets";

export type ClaraConnection = {
  id: string; org_id: string; agent_id: string | null; user_id: string | null;
  integration_id: string; auth_type: string; credentials: unknown; status: string;
  display_name: string | null; metadata: Record<string, unknown>;
};

export const credentialVault = {
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
  async decrypt(connectionId: string, orgId: string): Promise<unknown> {
    const rows = await query<{credentials_decrypted:string}>(
      `SELECT pgp_sym_decrypt(credentials_encrypted,$1) AS credentials_decrypted
         FROM integration_connections
        WHERE id=$2 AND org_id=$3 AND status='active'
        LIMIT 1`,
      [ENCRYPTION_KEY, connectionId, orgId],
    );
    return rows[0] ? JSON.parse(rows[0].credentials_decrypted) : null;
  },
  async updateStatus(connectionId: string, orgId: string, status: string): Promise<void> {
    await query(
      "UPDATE integration_connections SET status=$1,updated_at=now() WHERE id=$2 AND org_id=$3",
      [status,connectionId,orgId],
    );
  },
  async updateCredentials(connectionId: string, orgId: string, credentials: unknown): Promise<void> {
    await query(
      `UPDATE integration_connections
          SET credentials_encrypted=pgp_sym_encrypt($1,$2), status='active', updated_at=now()
        WHERE id=$3 AND org_id=$4 AND status='active'`,
      [JSON.stringify(credentials), ENCRYPTION_KEY, connectionId, orgId],
    );
  },
};
