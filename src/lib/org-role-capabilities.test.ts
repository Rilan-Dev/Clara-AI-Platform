import { describe, expect, it } from "vitest";
import { hasOrgCapability } from "./org-role-capabilities";

describe("organisation role capabilities", () => {
  it("gives org admins full workspace control", () => {
    expect(hasOrgCapability("org_admin", "createAgent")).toBe(true);
    expect(hasOrgCapability("org_admin", "manageMembers")).toBe(true);
    expect(hasOrgCapability("org_admin", "manageBilling")).toBe(true);
    expect(hasOrgCapability("org_admin", "publishAgent")).toBe(true);
  });

  it("keeps project managers out of billing while allowing delivery work", () => {
    expect(hasOrgCapability("project_manager", "createAgent")).toBe(true);
    expect(hasOrgCapability("project_manager", "manageKnowledge")).toBe(true);
    expect(hasOrgCapability("project_manager", "publishAgent")).toBe(true);
    expect(hasOrgCapability("project_manager", "manageBilling")).toBe(false);
  });

  it("limits editors to knowledge work", () => {
    expect(hasOrgCapability("kb_editor", "manageKnowledge")).toBe(true);
    expect(hasOrgCapability("kb_editor", "createAgent")).toBe(false);
    expect(hasOrgCapability("kb_editor", "editAgent")).toBe(false);
    expect(hasOrgCapability("kb_editor", "publishAgent")).toBe(false);
    expect(hasOrgCapability("kb_editor", "manageBilling")).toBe(false);
  });

  it("keeps viewers read-only", () => {
    expect(hasOrgCapability("kb_viewer", "viewDashboard")).toBe(true);
    expect(hasOrgCapability("kb_viewer", "viewAgents")).toBe(true);
    expect(hasOrgCapability("kb_viewer", "manageKnowledge")).toBe(false);
    expect(hasOrgCapability("kb_viewer", "createAgent")).toBe(false);
    expect(hasOrgCapability("kb_viewer", "manageMembers")).toBe(false);
    expect(hasOrgCapability("kb_viewer", "manageBilling")).toBe(false);
  });

  it("fails closed for missing or unknown roles", () => {
    expect(hasOrgCapability(null, "viewDashboard")).toBe(false);
    expect(hasOrgCapability("unknown", "viewAgents")).toBe(false);
  });
});
