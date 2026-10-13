// Live probe verification — runs the REAL probeStreamableHttpServer from the
// worktree against the user's n8n MCP endpoint. No DB calls are made by the
// probe itself; module imports must resolve.
import { probeStreamableHttpServer } from "../.worktrees/vc/src/modules/ai-platform-core/mcp-streamable-http-resolver";

async function main() {
  const endpoint = "https://n8n.ostechnologies.in/mcp-server/http";
  console.log("probing (no token)…");
  const noToken = await probeStreamableHttpServer(endpoint, null);
  console.log(JSON.stringify(noToken, null, 2));
  console.log("\nprobing (bad token)…");
  const badToken = await probeStreamableHttpServer(endpoint, "dummy-invalid-token");
  console.log(JSON.stringify({ ok: badToken.ok, error: badToken.error, errorCode: badToken.errorCode, durationMs: badToken.durationMs }, null, 2));
  process.exit(0);
}
void main();
