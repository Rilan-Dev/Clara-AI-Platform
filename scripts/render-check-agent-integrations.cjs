/**
 * Render check for the redesigned agent integrations screens.
 * Runs under tsx: `./node_modules/.bin/tsx scripts/render-check-agent-integrations.cjs`
 *
 * Stubs next/navigation + next/link via require-cache seeding, stubs fetch with
 * an n8n-like 39-tool MCP payload plus a filtered integration catalogue, then
 * mounts both screens with React's act() so effects/fetch flush, and asserts
 * the professional layout contract: collapsed MCP cards (no 39-tool dump),
 * readiness gate chips, tiered guidance messaging, and platform-filtered
 * integration cards.
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
            planAllowed: true, organisationEnabled: true, connected: false, agentEnabled: false },
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
const AgentMcpToolsPanel = require("../src/features/admin/screens/agent-mcp-tools-panel").default;

async function renderLoaded(Component) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => { root.render(createElement(Component)); });
  await act(async () => {}); // flush fetch → setState cycles
  return container.innerHTML;
}

(async () => {
  const htmlPanel = await renderLoaded(AgentMcpToolsPanel);
  const htmlScreen = await renderLoaded(AgentIntegrationsScreen);

  // Interaction: expand the collapsed N8N server card and flush.
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => { root.render(createElement(AgentMcpToolsPanel)); });
  await act(async () => {});
  const expandButton = container.querySelector('button[aria-expanded="false"]');
  if (!expandButton) throw new Error("collapsed server card header not found");
  await act(async () => { expandButton.dispatchEvent(new domWindow.MouseEvent("click", { bubbles: true })); });
  await act(async () => {});
  const htmlExpanded = container.innerHTML;
  root.unmount();

  const toolRows = (htmlPanel.match(/tool_\d+/g) ?? []).length;
  const distinctExpandedTools = new Set(htmlExpanded.match(/tool_\d+/g) ?? []).size;
  const checks = [
    ["panel renders section heading", htmlPanel.includes("MCP servers")],
    ["panel renders the N8N server card", htmlPanel.includes("N8N")],
    ["panel renders tool-count chip (39 tools)", htmlPanel.includes("39 tools")],
    ["panel renders agent-granted chip (2 granted)", htmlPanel.includes("2 granted to agent")],
    ["panel card is collapsed — no tool rows dumped", toolRows === 0],
    ["panel renders connection chip", htmlPanel.includes("Not connected")],
    ["screen renders page heading", htmlScreen.includes("Agent integrations")],
    ["screen renders tiered-model explainer", htmlScreen.includes("three steps")],
    ["screen renders integrations section heading", htmlScreen.includes("Organisation integrations")],
    ["screen renders all four catalogue cards (server-filtered response)",
      ["Google Drive", "GitHub", "Notion", "Slack"].every(n => htmlScreen.includes(n))],
    ["screen renders org-enablement guidance", htmlScreen.includes("Organisation enablement required")],
    ["screen renders credentials guidance", htmlScreen.includes("Credentials not connected")],
    ["screen renders plan-blocked guidance with plan id", htmlScreen.includes("Not included in the pro plan")],
    ["screen renders platform-disabled guidance for granted item", htmlScreen.includes("Disabled by platform administration")],
    ["screen renders enabled-agent counter", htmlScreen.includes("2 of 4 enabled for agent")],
    ["both API endpoints were requested", calls.some(c => c.includes("mcp-servers")) && calls.some(c => c.includes("agents/agent-1/integrations"))],
    // Expanded card contract
    ["expanded card renders readiness gate chips", htmlExpanded.includes("Org grants 3/39") && htmlExpanded.includes("pro plan")],
    ["expanded card renders blocking-cause guidance", htmlExpanded.includes("Organisation connection required")],
    ["expanded card links to organisation integrations", htmlExpanded.includes("Go to Organisation")],
    ["expanded card renders tool search box", htmlExpanded.includes("Search 39 tools")],
    ["expanded card renders bulk actions", htmlExpanded.includes("Grant all available") && htmlExpanded.includes("Revoke all")],
    ["expanded card lists all 39 tools once expanded", distinctExpandedTools === 39],
    ["expanded card shows org-grant status per tool", htmlExpanded.includes("Org granted") && htmlExpanded.includes("Org grant needed")],
    ["expanded card renders agent grant switches", (htmlExpanded.match(/role="switch"/g) ?? []).length === 39],
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
