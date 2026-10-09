import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (name: string) =>
  readFileSync(resolve(__dirname, name), "utf8");

describe("shared floating-panel and card layout contracts", () => {
  it("keeps dialog-like surfaces inside the viewport and permits scrolling", () => {
    const dialog = source("dialog.tsx");
    const alertDialog = source("alert-dialog.tsx");
    const sheet = source("sheet.tsx");
    const drawer = source("drawer.tsx");
    const modal = source("Modal.tsx");

    expect(dialog).toMatch(/w-\[calc\(100%-2rem\)\]/);
    expect(dialog).toMatch(/max-h-\[calc\(100dvh-2rem\)\]/);
    expect(dialog).toMatch(/overflow-y-auto/);
    expect(alertDialog).toMatch(/w-\[calc\(100%-2rem\)\]/);
    expect(alertDialog).toMatch(/max-h-\[calc\(100dvh-2rem\)\]/);
    expect(sheet).toMatch(/max-h-dvh/);
    expect(sheet).toMatch(/overflow-y-auto/);
    expect(drawer).toMatch(/max-h-\[calc\(100dvh-6rem\)\]/);
    expect(drawer).toMatch(/overflow-y-auto/);
    expect(modal).toMatch(/max-h-\[min\(90dvh,900px\)\]/);
    expect(modal).toMatch(/overflow-auto/);
  });

  it("bounds floating panels and allows long labels to wrap without break-all", () => {
    for (const name of ["popover.tsx", "hover-card.tsx", "tooltip.tsx", "dropdown-menu.tsx"]) {
      const content = source(name);
      expect(content, name).toMatch(/max-w-\[calc\(100vw-2rem\)\]/);
      expect(content, name).toMatch(/overflow-wrap:anywhere/);
      expect(content, name).not.toMatch(/break-all/);
    }
  });

  it("keeps feature-level OAuth and capability panels responsive", () => {
    const integrationDialog = source("../../features/admin/screens/org-integrations-screen.tsx");
    const platformOAuthDialog = source("../../features/admin/screens/platform-integrations-screen.tsx");
    const capabilityDrawer = source("../../features/admin/screens/agent-workspace/assistant-ai-screen.tsx");
    const kbDetails = source("../../features/admin/screens/kb-detail-screen.tsx");

    expect(integrationDialog).toMatch(/max-h-\[calc\(100dvh-2rem\)\]/);
    expect(integrationDialog).toMatch(/overflow-y-auto/);
    expect(integrationDialog).toMatch(/overflow-wrap:anywhere/);
    expect(platformOAuthDialog).toMatch(/max-h-\[calc\(100dvh-2rem\)\]/);
    expect(platformOAuthDialog).toMatch(/overflow-y-auto/);
    expect(capabilityDrawer).toMatch(/max-w-\[100vw\]/);
    expect(capabilityDrawer).toMatch(/overflow-wrap:anywhere/);
    expect(kbDetails).not.toMatch(/break-all/);
  });

  it("constrains subscription overlays and publish review on narrow viewports", () => {
    const subscriptions = source("../../features/admin/screens/subscriptions-screen.tsx");
    const publishReview = source("../../features/admin/layouts/publish-review-dialog.tsx");

    expect(subscriptions).toMatch(/max-h-\[92dvh\]/);
    expect(subscriptions).toMatch(/max-w-\[min\(100vw,32rem\)\]/);
    expect(subscriptions).toMatch(/min-h-0 min-w-0 flex-1 overflow-y-auto/);
    expect(publishReview).toMatch(/max-w-5xl/);
    expect(publishReview).toMatch(/min-w-0/);
    expect(publishReview).toMatch(/overflow-wrap:anywhere/);
  });

  it("keeps knowledge-base creation and published URLs overflow-safe", () => {
    const knowledge = source("../../features/admin/screens/agent-workspace/knowledge-screen.tsx");
    const publish = source("../../features/admin/screens/agent-workspace/publish-screen.tsx");

    expect(knowledge).toMatch(/max-h-\[calc\(100dvh-1rem\)\]/);
    expect(knowledge).toMatch(/overflow-y-auto/);
    expect(knowledge).toMatch(/overflow-wrap:anywhere/);
    expect(publish).not.toMatch(/break-all/);
    expect(publish).toMatch(/overflow-wrap:anywhere/);
  });

  it("covers account, API-key and publish-control overlays", () => {
    const profileModal = source("../../components/admin/EditProfileModal.tsx");
    const apiKeys = source("../../components/admin/ApiKeysManager.tsx");
    const orgPanel = source("../../components/admin/EditOrgPanel.tsx");
    const agentTopbar = source("../../features/admin/layouts/agent-topbar.tsx");
    const publishMenu = source("../../features/admin/layouts/publish-menu.tsx");
    const workspace = source("../../features/admin/screens/agent-workspace/workspace-shell.tsx");

    expect(profileModal).toMatch(/max-h-\[92dvh\]/);
    expect(profileModal).toMatch(/min-w-0/);
    expect(apiKeys).toMatch(/max-h-\[calc\(100dvh-1rem\)\]/);
    expect(apiKeys).toMatch(/overflow-y-auto/);
    expect(apiKeys).not.toMatch(/break-all/);
    expect(orgPanel).not.toMatch(/break-all/);
    expect(agentTopbar).toMatch(/w-\[min\(20rem,calc\(100vw-2rem\)\)\]/);
    expect(agentTopbar).not.toMatch(/break-all/);
    expect(publishMenu).toMatch(/overflow-y-auto/);
    expect(workspace).toMatch(/max-h-\[calc\(100dvh-1rem\)\]/);
  });

  it("keeps card content shrink-safe and wraps long titles/descriptions", () => {
    const card = source("card.tsx");
    expect(card).toMatch(/min-w-0/);
    expect(card).toMatch(/break-words/);
    expect(card).toMatch(/overflow-wrap:anywhere/);
  });
});
