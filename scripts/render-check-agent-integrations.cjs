/**
 * Render check for the redesigned agent integrations + MCP tools screens.
 * Runs under tsx: `./node_modules/.bin/tsx scripts/render-check-agent-integrations.cjs`
 *
 * Stubs next/navigation + next/link via require-cache seeding, stubs fetch with
 * an n8n-like 39-tool MCP payload plus a filtered integration catalogue, then
 * mounts both screens with React's act() so effects/fetch flush, and asserts
 * the layout contract:
 *  - the Integrations screen renders ONLY integrations (direct connect UX,
 *    plan-blocked messaging, no org-screen navigation links, no MCP region)
 *  - the MCP screen list stays minimal (no endpoint/tool dump) and the detail
 *    modal carries the full status, gates, search, bulk actions and tool rows
 */
"use strict";
const { createElement } = require("react");
const { act } = require("react");
const { createRoot } = require("react-dom/client");

// Minimal DOM environment for createRoot.
const { Window } = require("happy-dom");
const domWindow = new Window();
globalThis.window = domWindow;
globalThis.document = domWindow.document;
Object.defineProperty(globalThis, "navigator", { value: domWindow.navigator, configurable: true });
globalThis.HTMLElement = domWindow.HTMLElement;
globalThis.SVGElement = domWindow.SVGElement;
globalThis.Element = domWindow.Element;
globalThis.Node = domWindow.Node;

const params = { id: "org-1", agentId: "agent-1" };

// Seed require cache with navigation/link stubs BEFORE requiring the screens.
const navPath = require.resolve("next/navigation.js");
require.cache[navPath] = {
  id: navPath, filename: navPath, loaded: true,
  exports: {
    useParams: () => params,
    usePathname: () => "/orgs/org-1/agents/agent-1/integrations",
    useRouter: () => ({ push() {}, replace() {}, back() {} }),
    useSearchParams: () => new URLSearchParams(),
  },
};
const linkPath = require.resolve("next/link.js");
require.cache[linkPath] = {
  id: linkPath, filename: linkPath, loaded: true,
  exports: { __esModule: true, default: function StubLink(props) {
    return createElement("a", { href: props.href }, props.children);
  } },
};

// fetch stub — n8n-style server with 39 tools + filtered integration catalogue.
const calls = [];
globalThis.fetch = async (url) => {
  calls.push(String(url));
  const body = String(url).includes("mcp-servers")
    ? {
        plan: { id: "pro" },
        servers: [{
          id: "srv-1", serverKey: "camofox-mcp", displayName: "N8N",
          description: "Workflow automation", endpointUrl: "https://n8n.example/mcp-server/http",
          transportType: "streamable_http", authMode: "bearer", platformEnabled: true,
          hasPlatformCredential: false, oauthStatus: "not_connected", planAllowed: true,
          allowedPlans: ["pro", "enterprise"], connectionStatus: null,
          lastConnectedAt: null, lastErrorCode: null,
          tools: Array.from({ length: 39 }, (_, i) => ({
            name: `tool_${i}`, approved: true,
            allowedSurfaces: ["chat", "realtime"],
            organisationEnabled: i < 3, agentEnabled: i < 2,
          })),
        }],
      }
    : {
        plan: { id: "pro" },
        integrations: [
          { id: "google_drive", displayName: "Google Drive", description: "Files", logoUrl: "https://cdn.example/drive.png",
            category: "productivity", authType: "oauth2", actions: ["a", "b"], platformEnabled: true,
            planAllowed: true, organisationEnabled: true, connected: true, connectionStatus: "connected",
            connectionUpdatedAt: "2026-10-01T10:00:00.000Z", agentEnabled: false },
          { id: "github", displayName: "GitHub", description: "Repos", logoUrl: "https://cdn.example/github.png",
            category: "developer", authType: "secret_text", actions: ["a"], platformEnabled: true,
            planAllowed: false, organisationEnabled: true, connected: true, agentEnabled: true },
          { id: "notion", displayName: "Notion", description: "Notes", logoUrl: "https://cdn.example/notion.png",
            category: "productivity", authType: "oauth2", actions: ["a"], platformEnabled: true,
            planAllowed: true, organisationEnabled: false, connected: false, agentEnabled: false },
          { id: "slack", displayName: "Slack", description: "Chat", logoUrl: "https://cdn.example/slack.png",
            category: "communication", authType: "oauth2", actions: ["a"], platformEnabled: false,
            planAllowed: false, organisationEnabled: false, connected: false, agentEnabled: true },
        ],
      };
  return { ok: true, json: async () => body };
};

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const AgentIntegrationsScreen = require("../src/features/admin/screens/agent-integrations-screen").default;
const AgentMcpScreen = require("../src/features/admin/screens/agent-mcp-screen").default;

async function renderLoaded(Component) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => { root.render(createElement(Component)); });
  await act(async () => {}); // flush fetch → setState cycles
  return { html: container.innerHTML, container, root };
}

(async () => {
  const { html: htmlScreen } = await renderLoaded(AgentIntegrationsScreen);
  const { html: htmlMcpList, container: mcpContainer, root: mcpRoot } = await renderLoaded(AgentMcpScreen);

  // Interaction: open the minimal N8N row → detail modal renders in full.
  const openButton = mcpContainer.querySelector('button[aria-label="Open N8N details"]');
  if (!openButton) throw new Error("minimal MCP server row not found");
  await act(async () => { openButton.dispatchEvent(new domWindow.MouseEvent("click", { bubbles: true })); });
  await act(async () => {});
  const htmlDetail = mcpContainer.innerHTML;
  mcpRoot.unmount();

  const distinctDetailTools = new Set(htmlDetail.match(/tool_\d+/g) ?? []).size;
  const checks = [
    // ── Integrations screen: integrations only, direct-connect UX ──────────
    ["screen renders page heading", htmlScreen.includes("Agent integrations")],
    ["screen renders direct-connect explainer", htmlScreen.includes("credentials and choose which ones")],
    ["screen renders all four catalogue cards (server-filtered response)",
      ["Google Drive", "GitHub", "Notion", "Slack"].every(n => htmlScreen.includes(n))],
    ["screen renders plan-blocked message", htmlScreen.includes("This integration is not available for your plan")],
    ["plan-blocked card has no credentials nag", !htmlScreen.includes("An organisation admin must connect credentials")],
    ["screen has no link to the retired organisation integrations screen", !htmlScreen.includes("Manage organisation integrations")],
    ["screen has no MCP region (separate screens)", !htmlScreen.includes("MCP")],
    ["connected card offers reconnect/disconnect actions",
      htmlScreen.includes("Reconnect account") && htmlScreen.includes("Disconnect")],
    ["unconnected plan-allowed card offers direct connect", htmlScreen.includes("Connect account")],
    ["screen renders connected status", htmlScreen.includes("Connected")],
    ["screen renders enabled-agent counter", htmlScreen.includes("2 of 4 enabled for agent")],
    ["agent integrations endpoint was requested", calls.some(c => c.includes("agents/agent-1/integrations"))],

    // ── MCP screen: minimal list, full detail modal ─────────────────────────
    ["mcp screen renders page heading", htmlMcpList.includes("MCP tools")],
    ["mcp list renders the N8N row", htmlMcpList.includes("N8N")],
    ["mcp list renders status chip", htmlMcpList.includes("Not connected")],
    ["mcp list renders tool-count chip", htmlMcpList.includes("39 tools")],
    ["mcp list renders agent-granted chip", htmlMcpList.includes("2 granted")],
    ["mcp list is minimal — no endpoint URL dumped", !htmlMcpList.includes("https://n8n.example")],
    ["mcp list is minimal — no tool rows dumped", (htmlMcpList.match(/tool_\d+/g) ?? []).length === 0],
    ["mcp list has no description text", !htmlMcpList.includes("Workflow automation")],
    ["mcp endpoint was requested with agent scope", calls.some(c => c.includes("mcp-servers?agentId=agent-1"))],

    // ── Detail modal contract ───────────────────────────────────────────────
    ["detail modal renders description", htmlDetail.includes("Workflow automation")],
    ["detail modal renders endpoint URL", htmlDetail.includes("https://n8n.example/mcp-server/http")],
    ["detail modal renders readiness gates", htmlDetail.includes("Org tools 3/39") && htmlDetail.includes("Platform")],
    ["detail modal renders connect action", htmlDetail.includes("Connect")],
    ["detail modal renders tool search box", htmlDetail.includes("Search 39 tools")],
    ["detail modal renders bulk actions", htmlDetail.includes("Grant all") && htmlDetail.includes("Revoke all")],
    ["detail modal lists all 39 tools", distinctDetailTools === 39],
    ["detail modal shows org-grant state per tool", htmlDetail.includes("Org grant needed")],
    ["detail modal renders agent grant switches", (htmlDetail.match(/role="switch"/g) ?? []).length === 39],
    ["detail modal has no organisation-screen navigation link", !htmlDetail.includes("Go to Organisation")],
  ];

  let failed = 0;
  for (const [label, ok] of checks) {
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  }
  if (failed) {
    console.error(`${failed} render checks failed`);
    process.exit(1);
  }
  console.log("All render checks passed.");
})();
