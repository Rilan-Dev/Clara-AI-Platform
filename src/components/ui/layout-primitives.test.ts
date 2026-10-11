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
    const integrationDialog = source("../../features/admin/screens/agent-integrations-screen.tsx");
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

  it("uses natural wrapping for verification emails, endpoint paths and email links", () => {
    const adminLogin = source("../../features/admin/screens/login-screen.tsx");
    const emailVerification = source("../../app/login/verify-email/page.tsx");
    const signupVerification = source("../../features/platform/screens/signup-verify-screen.tsx");
    const apiDocs = source("../../features/platform/screens/docs-api-screen.tsx");
    const emailTemplate = source("../../lib/email.ts");

    expect(adminLogin).not.toMatch(/break-all/);
    expect(emailVerification).not.toMatch(/break-all/);
    expect(signupVerification).not.toMatch(/break-all/);
    expect(apiDocs).not.toMatch(/break-all/);
    expect(emailTemplate).not.toMatch(/word-break:break-all/);
    expect(emailTemplate).toMatch(/overflow-wrap:anywhere/);
  });

  it("keeps fullscreen configuration and workspace copy values viewport-safe", () => {
    const configEditor = source("../../components/admin/ConfigEditor.tsx");
    const workspaceWizard = source("../../components/admin/WorkspaceWizard.tsx");
    const embedKeys = source("../../components/admin/EmbedApiKeyPanel.tsx");

    expect(configEditor).toMatch(/max-h-\[calc\(100dvh-1rem\)\]/);
    expect(configEditor).toMatch(/w-\[calc\(100vw-1rem\)\]/);
    expect(workspaceWizard).not.toMatch(/flex-1 truncate rounded-lg border border-border bg-muted\/50/);
    expect(workspaceWizard).toMatch(/overflow-wrap:anywhere/);
    expect(embedKeys).toMatch(/overflow-wrap:anywhere/);
  });

  it("keeps system errors and organisation identifiers readable at narrow widths", () => {
    const systemStatus = source("../../features/admin/screens/system-status-screen.tsx");
    const orgSettings = source("../../features/admin/screens/org-settings-screen.tsx");

    expect(systemStatus).not.toMatch(/break-all/);
    expect(systemStatus).toMatch(/overflow-wrap:anywhere/);
    expect(orgSettings).not.toMatch(/font-mono text-right sm:text-left sm:mt-0\.5 truncate/);
    expect(orgSettings).toMatch(/overflow-wrap:anywhere/);
  });

  it("keeps email audit notes, billing notes, and variable descriptions from truncating", () => {
    const emailAudit = source("../../components/admin/EmailTemplatesPanel.tsx");
    const billing = source("../../features/admin/screens/org-billing-screen.tsx");
    const variables = source("../../components/admin/email-templates/VariablesManagerDialog.tsx");

    expect(emailAudit).not.toMatch(/min-w-0 flex-1 truncate text-xs text-muted-foreground/);
    expect(emailAudit).toMatch(/overflow-wrap:anywhere/);
    expect(billing).not.toMatch(/entry\.note.*truncate/);
    expect(billing).toMatch(/overflow-wrap:anywhere/);
    expect(variables).not.toMatch(/min-w-0 flex-1 truncate text-xs text-muted-foreground/);
    expect(variables).toMatch(/overflow-wrap:anywhere/);
  });

  it("keeps live conversation messages shrink-safe with long user and assistant text", () => {
    const conversation = source("../../features/agent-conversation/components/conversation-chat-window.tsx");

    expect(conversation).not.toMatch(/max-w-\[85%\]/);
    expect(conversation).not.toMatch(/max-w-\[90%\]/);
    expect(conversation).toMatch(/max-w-\[calc\(100%-2\.625rem\)\]/);
    expect(conversation).toMatch(/overflow-wrap:anywhere/);
    expect(conversation).toMatch(/whitespace-pre-wrap break-words/);
  });

  it("constrains demo chat bubbles and OAuth form controls to their containers", () => {
    const landing = source("../../features/platform/screens/landing-screen.tsx");
    const platformOAuth = source("../../features/admin/screens/platform-integrations-screen.tsx");

    expect(landing).toMatch(/w-full min-w-0 max-w-3xl/);
    expect(landing).toMatch(/max-w-\[calc\(100%-2\.75rem\)\]/);
    expect(landing).toMatch(/overflow-wrap:anywhere/);
    expect(landing).not.toMatch(/max-w-\[85%\]/);
    expect(platformOAuth).toMatch(/overflow-x-hidden/);
    expect(platformOAuth).toMatch(/flex-wrap items-center justify-between gap-3/);
    expect(platformOAuth).toMatch(/w-full min-w-0 max-w-full/);
  });

  it("preserves long agent names and analytics query text in cards", () => {
    const orgAgents = source("../../features/admin/screens/org-agents-screen.tsx");
    const analytics = source("../../features/admin/screens/analytics-screen.tsx");

    expect(orgAgents).not.toMatch(/className="truncate text-sm font-medium text-foreground hover:text-primary"/);
    expect(orgAgents).toMatch(/overflow-wrap:anywhere/);
    expect(analytics).not.toMatch(/q\.query_text.*truncate/);
    expect(analytics).toMatch(/overflow-wrap:anywhere/);
  });

  it("wraps long payment URLs, member identities, and uploaded/web source names", () => {
    const payment = source("../../components/admin/PaymentGatewayPanel.tsx");
    const members = source("../../features/admin/screens/org-members-screen.tsx");
    const uploads = source("../../components/admin/UploadZone.tsx");
    const webSources = source("../../components/admin/WebSourcesPanel.tsx");

    expect(payment).not.toMatch(/flex-1 truncate rounded-md border border-border bg-background/);
    expect(payment).toMatch(/overflow-wrap:anywhere/);
    expect(members).not.toMatch(/text-sm font-medium text-foreground flex items-center gap-2 truncate/);
    expect(members).not.toMatch(/text-xs text-muted-foreground\/70 truncate/);
    expect(members).toMatch(/overflow-wrap:anywhere/);
    expect(uploads).not.toMatch(/doc\.(?:title|originalFilename).*truncate/);
    expect(uploads).toMatch(/overflow-wrap:anywhere/);
    expect(webSources).not.toMatch(/doc\.(?:title|originalFilename).*truncate/);
    expect(webSources).not.toMatch(/session\.rootUrl.*truncate/);
    expect(webSources).toMatch(/overflow-wrap:anywhere/);
  });

  it("wraps analytics queries, organisation usage labels, config choices, and language names", () => {
    const dashboard = source("../../components/admin/AnalyticsDashboard.tsx");
    const analytics = source("../../features/admin/screens/analytics-screen.tsx");
    const config = source("../../components/admin/ConfigEditor.tsx");
    const translator = source("../../components/admin/FirstMessageTranslator.tsx");

    expect(dashboard).not.toMatch(/q\.queryText.*truncate/);
    expect(dashboard).toMatch(/overflow-wrap:anywhere/);
    expect(analytics).not.toMatch(/org\.(?:org_name|org_slug).*truncate/);
    expect(analytics).toMatch(/overflow-wrap:anywhere/);
    expect(config).not.toMatch(/className="block truncate text-(?:sm|\[11px\])/);
    expect(config).toMatch(/overflow-wrap:anywhere/);
    expect(translator).not.toMatch(/flex-1 truncate/);
    expect(translator).toMatch(/overflow-wrap:anywhere/);
  });

  it("keeps card content shrink-safe and wraps long titles/descriptions", () => {
    const card = source("card.tsx");
    expect(card).toMatch(/min-w-0/);
    expect(card).toMatch(/break-words/);
    expect(card).toMatch(/overflow-wrap:anywhere/);
  });
  it("keeps landing hero/feature cards and login form cards from clipping long content", () => {
    const landing = source("../../features/platform/screens/landing-screen.tsx");
    const login = source("../../features/admin/screens/login-screen.tsx");

    expect(landing).toMatch(/relative z-10 w-full min-w-0 max-w-6xl/);
    expect(landing).toMatch(/min-w-0 break-words \[overflow-wrap:anywhere\]/);
    expect(landing).toMatch(/glass-card min-w-0 rounded-2xl/);
    expect(login).toMatch(/w-full min-w-0 max-w-full rounded-2xl border border-border bg-card/);
    expect(login).toMatch(/form onSubmit=\{handleSubmit\} className="min-w-0 space-y-4"/);
    expect(login).toMatch(/block w-full min-w-0 max-w-full box-border bg-background/);
    expect(login).toMatch(/overflow-wrap:anywhere/);
  });

  it("keeps signup, forgot-password, reset-password and email-verification cards responsive", () => {
    const signup = source("../../features/platform/screens/signup-screen.tsx");
    const forgot = source("../../app/login/forgot/page.tsx");
    const reset = source("../../app/login/reset/page.tsx");
    const verify = source("../../app/login/verify-email/page.tsx");

    expect(signup).toMatch(/w-full min-w-0 max-w-lg/);
    expect(signup).toMatch(/w-full min-w-0 max-w-full border border-border bg-card/);
    expect(signup).toMatch(/flex min-w-0 flex-wrap items-start justify-between gap-3/);
    expect(signup).toMatch(/block w-full min-w-0 max-w-full box-border/);
    expect(forgot).toMatch(/w-full min-w-0 max-w-full border border-border bg-card/);
    expect(forgot).toMatch(/block w-full min-w-0 max-w-full box-border/);
    expect(reset).toMatch(/w-full min-w-0 max-w-full border border-border bg-card/);
    expect(reset).toMatch(/block w-full min-w-0 max-w-full box-border/);
    expect(verify).toMatch(/w-full min-w-0 max-w-full border border-border bg-card/);
  });

  it("keeps pricing, checkout, checkout-success and signup-verification cards responsive", () => {
    const pricing = source("../../features/platform/screens/pricing-screen.tsx");
    const checkout = source("../../features/platform/screens/checkout-screen.tsx");
    const success = source("../../features/platform/screens/checkout-success-screen.tsx");
    const signupVerify = source("../../features/platform/screens/signup-verify-screen.tsx");

    expect(pricing).toMatch(/grid min-w-0 md:grid-cols-2 lg:grid-cols-4/);
    expect(pricing).toMatch(/relative min-w-0 rounded-2xl/);
    expect(pricing).toMatch(/overflow-wrap:anywhere/);
    expect(checkout).toMatch(/w-full min-w-0 max-w-md/);
    expect(checkout).toMatch(/w-full min-w-0 max-w-full border rounded-2xl/);
    expect(checkout).toMatch(/flex min-w-0 flex-wrap items-start justify-between gap-3/);
    expect(success).toMatch(/w-full min-w-0 max-w-lg text-center/);
    expect(success).toMatch(/flex flex-wrap justify-between gap-x-3 gap-y-1/);
    expect(signupVerify).toMatch(/w-full min-w-0 max-w-md text-center/);
    expect(signupVerify).toMatch(/w-full min-w-0 border border-border bg-card/);
  });

  it("keeps the public contact form and its cards shrink-safe", () => {
    const contact = source("../../features/platform/screens/contact-screen.tsx");
    expect(contact).toMatch(/w-full min-w-0 max-w-5xl/);
    expect(contact).toMatch(/w-full min-w-0 max-w-full border border-border bg-card/);
    expect(contact).toMatch(/block w-full min-w-0 max-w-full box-border/);
    expect(contact).toMatch(/overflow-wrap:anywhere/);
  });
});
