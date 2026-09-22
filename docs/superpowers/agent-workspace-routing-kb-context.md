# Agent Workspace Routing & Knowledge Base Context

## Goal
Keep the existing organisation sidebar as the single navigation rail while making agent actions and knowledge-base details persist inside the selected agent workspace.

## Root causes
1. Agent overview built the publish URL from asynchronously loaded workspace context, so the first click could generate `/orgs/agents/:agentId/publish` before `context.agent.orgId` existed.
2. Agent knowledge links used the legacy global `/kbs/:kbId` route, which exits the agent workspace and therefore loses the selected-agent navigation context.

## Design
- Treat the organisation route segment `/orgs/:orgId` as the authoritative org identity for agent navigation.
- Keep publish/overview actions under `/orgs/:orgId/agents/:agentId/*`.
- Add the nested KB detail route `/orgs/:orgId/agents/:agentId/knowledge/:kbId`.
- Reuse the existing KB detail screen; do not duplicate KB functionality.
- Keep the existing organisation sidebar and agent navigation groups. No second sidebar.
- Treat both `/knowledge` and `/knowledge/:kbId` as the Knowledge agent tab so the sidebar remains selected.
- New KB creation should land directly in the agent-scoped KB detail route.
- Preserve the legacy `/kbs/:kbId` route for existing external/deep links and backward compatibility.

## UX review
- Agent identity remains visible while operating on a KB.
- Dashboard, Agents, Members, Billing remain accessible.
- Agent Overview, Agent, Knowledge, Tools, Branches, Publish remain visible.
- Knowledge stays highlighted on KB detail.
- Deep links and browser navigation retain agent context.
- Existing KB document, scrape, analytics, deploy, design and phone capabilities are reused unchanged.

## Verification
- Build/type-check.
- Inspect changed route/link references.
- Verify no agent workspace CTA constructs an org URL from loading-only context.
- Open the production CTA and nested KB route in production after deployment.
