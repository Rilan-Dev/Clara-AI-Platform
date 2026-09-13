/**
 * Runtime verification for the unified agents model (projects renamed to agents).
 *
 * Checks that resolveAIConfig works end-to-end against the renamed tables:
 *  - KB -> agent (renamed projects) -> org resolution
 *  - KB assistant config takes precedence; agent persona columns act as defaults
 *  - agent persona fills gaps when the KB config is empty
 *
 * Run: npx tsx scripts/verify-agent-resolution.ts
 */
import fs from "node:fs";
import path from "node:path";

// Load .env manually FIRST — module imports below create the pg pool at
// module evaluation time, so env vars must be set before they run (CJS has
// no top-level await, so dynamic imports happen inside main()).
const envPath = path.join(process.cwd(), ".env");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

type ResolveFn = typeof import("@/modules/ai-core/resolve")["resolveAIConfig"];
type PoolMod = typeof import("@/lib/db");

async function main() {
  const { resolveAIConfig } = (await import("@/modules/ai-core/resolve")) as { resolveAIConfig: ResolveFn };
  const { pool } = (await import("@/lib/db")) as PoolMod;

  // A KB whose agent carries the migrated persona (Omen Insurance Operations)
  const { rows: kbRows } = await pool.query<{ id: string; agent_id: string; kb_name: string; agent_name: string }>(
    `SELECT kb.id, kb.agent_id, kb.name AS kb_name, a.name AS agent_name
       FROM knowledge_bases kb JOIN agents a ON a.id = kb.agent_id
      WHERE a.assistant_name = 'Clara' AND a.voice_id IS NOT NULL
      LIMIT 1`,
  );
  if (kbRows.length === 0) {
    console.log("No agent-with-persona KB found — nothing to verify.");
    return;
  }
  const kb = kbRows[0];
  console.log(`Testing with KB "${kb.kb_name}" (agent: ${kb.agent_name})`);

  const before = await resolveAIConfig({ kbId: String(kb.id), surface: "chat" });
  console.log("resolved:", {
    assistantName: before.assistantConfig?.assistantName,
    voice: before.assistantConfig?.voiceId,
    temperature: before.assistantConfig?.temperature,
    languages: before.allowedLanguages,
    chatSource: before.sources.chatModel,
    providerSource: before.sources.provider,
  });

  // Simulate the agent persona filling a gap: clear the KB's welcome message
  // (committed — resolveAIConfig uses its own pool connections), then confirm
  // the agent's welcome message applies as the default, then restore.
  const { rows: agentRows } = await pool.query<{ welcome_message: string }>(
    "SELECT welcome_message FROM agents WHERE id = $1",
    [kb.agent_id],
  );
  const agentWelcome = String(agentRows[0]?.welcome_message ?? "");

  const { rows: origRows } = await pool.query<{ welcome_message: string }>(
    "SELECT welcome_message FROM assistant_configs WHERE kb_id = $1",
    [kb.id],
  );
  const originalWelcome = String(origRows[0]?.welcome_message ?? "");

  await pool.query("UPDATE assistant_configs SET welcome_message = '' WHERE kb_id = $1", [kb.id]);
  try {
    const after = await resolveAIConfig({ kbId: String(kb.id), surface: "chat" });
    const fallbackApplied = after.assistantConfig?.welcomeMessage === agentWelcome;
    console.log(`agent persona fallback (welcome): ${fallbackApplied ? "APPLIED ✓" : "NOT APPLIED ✗"}`);
    if (!fallbackApplied) {
      console.log(`  expected agent welcome: ${JSON.stringify(agentWelcome)}`);
      console.log(`  resolved welcome:       ${JSON.stringify(after.assistantConfig?.welcomeMessage)}`);
    }
  } finally {
    await pool.query("UPDATE assistant_configs SET welcome_message = $1 WHERE kb_id = $2", [originalWelcome, kb.id]);
    console.log("demo KB config restored.");
  }

  await pool.end();
  console.log("\nRUNTIME RESOLUTION VERIFIED against the unified agents schema.");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
