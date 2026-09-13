/**
 * Runtime verification: assign an agent to a project with a KB, then resolve
 * the AI config for that KB and confirm the agent's settings win.
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
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

// Type-only imports (erased at compile time — safe before env load)
type ResolveFn = typeof import("@/modules/ai-core/resolve")["resolveAIConfig"];
type AgentsDb = typeof import("@/modules/agents/core/db");
type OrgsDb = typeof import("@/modules/organisations/core/db");
type PoolMod = typeof import("@/lib/db");

async function main() {
  // Dynamic imports AFTER env is loaded (pool is created at module-eval time)
  const { resolveAIConfig } = (await import("@/modules/ai-core/resolve")) as { resolveAIConfig: ResolveFn };
  const agentsDb = (await import("@/modules/agents/core/db")) as AgentsDb;
  const { createAgent, assignAgentToProject, deleteAgent, getActiveAgentForProject } = agentsDb;
  const { getProjectById } = (await import("@/modules/organisations/core/db")) as OrgsDb;
  const { pool } = (await import("@/lib/db")) as PoolMod;
  // Find org + project that has a knowledge base
  const { rows: kbRows } = await pool.query<{ id: string; project_id: string; name: string }>(
    "SELECT kb.id, kb.project_id, kb.name FROM knowledge_bases kb LIMIT 5",
  );
  if (kbRows.length === 0) { console.log("No KBs in DB — cannot verify runtime."); return; }
  const kb = kbRows[0];
  const project = await getProjectById(String(kb.project_id));
  if (!project) { console.log("Project missing"); return; }
  console.log(`Testing with KB "${kb.name}" (project: ${project.name})`);

  // Save the project's current active agent so we can restore it afterwards
  const prevAgent = await getActiveAgentForProject(project.id);

  // 1. Baseline resolution (no agent)
  const before = await resolveAIConfig({ kbId: String(kb.id), surface: "chat" });
  console.log("baseline:", {
    assistantName: before.assistantConfig?.assistantName,
    voice: before.voiceId,
    temperature: before.assistantConfig?.temperature,
    languages: before.allowedLanguages,
    chatSource: before.sources.chatModel,
  });

  // 2. Create + assign an agent with distinctive values
  const agent = await createAgent({
    orgId: project.orgId,
    name: `Runtime Check ${Date.now()}`,
    assistantName: "Aurora",
    systemPrompt: "You are Aurora, a runtime test persona.",
    welcomeMessage: "Aurora here!",
  });
  await assignAgentToProject(project.id, agent.id);

  // 3. Resolution with the agent active
  const after = await resolveAIConfig({ kbId: String(kb.id), surface: "chat" });
  console.log("with agent:", {
    assistantName: after.assistantConfig?.assistantName,
    systemPromptHead: after.assistantConfig?.systemPrompt?.slice(0, 40),
    welcome: after.assistantConfig?.welcomeMessage,
    voice: after.voiceId,
    temperature: after.assistantConfig?.temperature,
    languages: after.allowedLanguages,
    chatSource: after.sources.chatModel,
    voiceSource: after.sources.voiceId,
  });

  const ok =
    after.assistantConfig?.assistantName === "Aurora" &&
    after.assistantConfig?.welcomeMessage === "Aurora here!" &&
    after.assistantConfig?.systemPrompt?.startsWith("You are Aurora");

  // 4. Update agent voice/language via patch path
  const { updateAgent } = await import("@/modules/agents/core/db");
  await updateAgent(agent.id, { voiceProvider: "openai", voiceId: "sage", allowedLanguages: ["en", "si"], temperature: 0.3 });
  const afterUpdate = await resolveAIConfig({ kbId: String(kb.id), surface: "chat" });
  console.log("after voice/temp/lang update:", {
    assistantLangs: afterUpdate.allowedLanguages,
    temperature: afterUpdate.assistantConfig?.temperature,
  });

  // 5. Cleanup: unassign + delete, then RESTORE whatever agent was active before
  await assignAgentToProject(project.id, null);
  await deleteAgent(agent.id);
  if (prevAgent) await assignAgentToProject(project.id, prevAgent.id);
  const restored = await resolveAIConfig({ kbId: String(kb.id), surface: "chat" });
  console.log("after cleanup:", { assistantName: restored.assistantConfig?.assistantName });
  const cleaned = prevAgent ? await getActiveAgentForProject(project.id) : null;
  const linkRestored = prevAgent ? cleaned?.id === prevAgent.id : cleaned === null;

  console.log(ok && linkRestored ? "\nRUNTIME OVERLAY VERIFIED (previous assignment restored)" : "\nRUNTIME CHECK FAILED");
  process.exit(ok && linkRestored ? 0 : 1);
}

main().catch((e) => { console.error("verify crashed:", e); process.exit(1); });
