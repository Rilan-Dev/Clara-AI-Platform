import { query } from "@/lib/db";

/**
 * PostgreSQL-backed key-value store for integration actions.
 * Implements the Activepieces Store interface required by ActionContext.
 * Uses the integration_store table.
 */
export class PostgresStore {
  constructor(
    private userId: string,
    private workspaceId: string,
    private agentId?: string,
  ) {}

  async put<T>(key: string, value: T, scope?: string): Promise<T> {
    const scopeKey = this.buildKey(key, scope);
    await query(
      `INSERT INTO integration_store (scope_key,value,org_id,user_id,agent_id,updated_at)
       VALUES ($1,$2,$3,$4,$5,now())
       ON CONFLICT(scope_key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,
      [scopeKey, JSON.stringify(value), this.workspaceId, this.userId, this.agentId ?? null],
    );
    return value;
  }

  async get<T>(key: string, scope?: string): Promise<T | null> {
    const scopeKey = this.buildKey(key, scope);
    const rows = await query<{value:T}>(`SELECT value FROM integration_store WHERE scope_key=$1`,[scopeKey]);
    const row = rows[0];
    return row ? (row.value as T) : null;
  }

  async delete(key: string, scope?: string): Promise<void> {
    const scopeKey = this.buildKey(key, scope);
    await query("DELETE FROM integration_store WHERE scope_key=$1",[scopeKey]);
  }

  private buildKey(key: string, scope?: string): string {
    // StoreScope.FLOW = "FLOW", StoreScope.PROJECT = "PROJECT"
    const prefix = scope === "FLOW"
      ? `flow:${this.userId}`
      : `project:${this.workspaceId}`;
    return `${prefix}:${key}`;
  }
}
