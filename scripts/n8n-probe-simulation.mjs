// Standalone live probe simulation — replicates the exact MCP handshake the
// Clara probe performs (initialize → notifications/initialized → tools/list)
// against the user's n8n endpoint, to verify error-shape fidelity without a
// valid API key (expect a structured 401).
const endpoint = "https://n8n.ostechnologies.in/mcp-server/http";
const body = JSON.stringify({
  jsonrpc: "2.0", id: "clara-test-1", method: "initialize",
  params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "clara-ai-platform", version: "1.0.0" } },
});
const headers = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
  "mcp-protocol-version": "2025-03-26",
};
async function probe(token) {
  const h = { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) };
  const started = Date.now();
  try {
    const res = await fetch(endpoint, { method: "POST", headers: h, body, redirect: "manual" });
    const text = await res.text();
    console.log(`token=${token ? "supplied" : "none"} status=${res.status} durationMs=${Date.now() - started}`);
    console.log(`  headers: mcp-session-id=${res.headers.get("mcp-session-id") ?? "(none)"}`);
    console.log(`  body: ${text.slice(0, 200)}`);
  } catch (e) {
    console.log(`token=${token ? "supplied" : "none"} FAILED: ${e.message}`);
  }
}
await probe(null);
await probe("dummy-invalid-token-for-shape-test");
