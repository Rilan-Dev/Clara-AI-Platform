/**
 * src/components/admin/email-templates/shared.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared types, labels and sample data for the Email Templates workspace
 * (panel, code editor, variable picker and variable manager).
 */

export type TemplateVariable = { name: string; description: string };

export type EmailTemplate = {
  key: string;
  name: string;
  description: string;
  category: string;
  subject: string;
  bodyHtml: string;
  variables: TemplateVariable[];
  isActive: boolean;
  updatedAt: string;
  isCustomized: boolean;
  draft: {
    subject: string;
    bodyHtml: string;
    updatedAt: string;
    updatedBy: string | null;
  } | null;
};

export type ManagedVariable = {
  name: string;
  category: "auth" | "invitation" | "subscription" | "system" | "custom";
  description: string;
  value: string;
  isSystem: boolean;
  usedIn: string[];
  updatedAt: string;
};

export type AuditEntry = {
  id: number;
  action: string;
  subject: string;
  isActive: boolean;
  updatedBy: string | null;
  createdAt: string;
};

export const CATEGORY_LABELS: Record<string, string> = {
  auth: "Account & security",
  invitation: "Invitations",
  subscription: "Subscriptions & billing",
  system: "System",
  custom: "Custom",
};

export const TEMPLATE_CATEGORY_ORDER = ["auth", "invitation", "subscription", "system"];
export const VARIABLE_CATEGORY_ORDER = ["auth", "invitation", "subscription", "system", "custom"];

/** Friendly sample values for the live preview and test sends. */
export const SAMPLE: Record<string, string> = {
  userName: "Aisha Rahman",
  orgName: "Demo Organisation",
  planName: "Pro",
  oldPlan: "Starter",
  newPlan: "Pro",
  role: "org admin",
  trialEnd: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
  trialDays: "7",
  note: "We upgraded you early — enjoy!",
  resetUrl: "https://clara.example.com/login/reset?token=sample-token",
  inviteUrl: "https://clara.example.com/login/reset?token=sample-token",
  loginUrl: "https://clara.example.com/login",
  renewUrl: "https://clara.example.com/login",
  appName: "Clara AI",
  provider: "resend",
  sentAt: new Date().toLocaleString(),
  to: "you@example.com",
};

export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (match, name: string) =>
    name in vars ? vars[name] : match,
  );
}

/** Placeholder names still visible after interpolation (likely typos). */
export function unresolvedVariables(rendered: string): string[] {
  const found = new Set<string>();
  for (const m of rendered.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g)) {
    found.add(m[1]);
  }
  return [...found];
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
