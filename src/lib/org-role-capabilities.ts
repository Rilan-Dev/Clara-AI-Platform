/**
 * Client-side organisation capabilities.
 *
 * This is presentation logic only. API/RBAC checks remain authoritative.
 * Keep this matrix aligned with the server role/permission model so the UI
 * does not advertise actions that will necessarily be rejected.
 */
export type OrgRole = "org_admin" | "project_manager" | "kb_editor" | "kb_viewer";

export type OrgCapability =
  | "viewDashboard"
  | "viewAgents"
  | "createAgent"
  | "editAgent"
  | "manageKnowledge"
  | "manageMembers"
  | "inviteMembers"
  | "manageBilling"
  | "publishAgent";

const CAPABILITIES: Record<OrgRole, readonly OrgCapability[]> = {
  org_admin: [
    "viewDashboard", "viewAgents", "createAgent", "editAgent",
    "manageKnowledge", "manageMembers", "inviteMembers",
    "manageBilling", "publishAgent",
  ],
  project_manager: [
    "viewDashboard", "viewAgents", "createAgent", "editAgent",
    "manageKnowledge", "inviteMembers", "publishAgent",
  ],
  kb_editor: [
    "viewDashboard", "viewAgents", "manageKnowledge",
  ],
  kb_viewer: [
    "viewDashboard", "viewAgents",
  ],
};

export function hasOrgCapability(
  role: OrgRole | string | null | undefined,
  capability: OrgCapability,
): boolean {
  if (!role || !(role in CAPABILITIES)) return false;
  return CAPABILITIES[role as OrgRole].includes(capability);
}
