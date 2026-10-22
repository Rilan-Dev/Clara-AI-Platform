/**
 * The single list of platform-admin settings pages, grouped by purpose.
 * Used by the sidebar, the mobile section pills and the Account overview so
 * the three can never drift apart again.
 *
 * Every configuration value has exactly ONE home:
 *   AI Platform         provider API keys, default models, voices, Default Assistant
 *   Voice & AI runtime  ElevenLabs / Sarvam feature switches, secrets, platform limits
 *   Payments            Stripe / Razorpay credentials, price IDs, public app URL
 *   Website & widget    landing-page chat widget key
 *   Phone calls         Twilio / Vonage
 *   Email delivery      Resend / SMTP
 */

import {
  Bot,
  Cable,
  CreditCard,
  FileText,
  KeyRound,
  Mail,
  Megaphone,
  Palette,
  Phone,
  PlugZap,
  SlidersHorizontal,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export type SettingsSection =
  | "account" | "appearance" | "ai" | "environment" | "embed" | "mcp" | "mcpGovernance"
  | "payments" | "email" | "templates" | "phone" | "announcements" | "integrations";

export type SettingsGroup = "You" | "Platform" | "AI & voice" | "Billing" | "Communications" | "Channels";

export type SettingsPage = {
  id: SettingsSection;
  href: string;
  icon: LucideIcon;
  /** Short label for the sidebar. */
  label: string;
  /** Page heading. */
  title: string;
  /** One plain-English sentence under the heading. */
  description: string;
  group: SettingsGroup;
  audience: string;
};

export const SETTINGS_GROUP_ORDER: SettingsGroup[] = [
  "You", "Platform", "AI & voice", "Billing", "Communications", "Channels",
];

export const ACCOUNT_PAGE: SettingsPage = {
  id: "account",
  href: "/settings/account",
  icon: UserRound,
  label: "Account",
  title: "Your account",
  description: "Update your name, profile photo, and personal details.",
  group: "You",
  audience: "Everyone",
};

export const ADMIN_SETTINGS_PAGES: SettingsPage[] = [
  ACCOUNT_PAGE,
  {
    id: "appearance",
    href: "/settings/appearance",
    icon: Palette,
    label: "Appearance",
    title: "Default theme",
    description: "Choose the theme new visitors see first — light, dark, or follow their device. People can still switch it themselves.",
    group: "Platform",
    audience: "Platform admin",
  },
  {
    id: "embed",
    href: "/settings/embed",
    icon: KeyRound,
    label: "Website & widget",
    title: "Website & widget",
    description: "The key that lets the chat widget on your public website talk to Clara.",
    group: "Platform",
    audience: "Platform admin",
  },
  {
    id: "integrations",
    href: "/settings/integrations",
    icon: PlugZap,
    label: "Integrations",
    title: "Integrations",
    description: "Control the integration catalog exposed to organisations and their agents.",
    group: "Platform",
    audience: "Platform admin",
  },
  {
    id: "mcpGovernance",
    href: "/settings/mcp/governance",
    icon: Cable,
    label: "MCP governance",
    title: "MCP governance",
    description: "Global MCP enablement, security policy, emergency controls, plan-entitlement boundaries and platform catalog switches.",
    group: "Platform",
    audience: "Platform admin",
  },
  {
    id: "announcements",
    href: "/settings/announcements",
    icon: Megaphone,
    label: "Announcements",
    title: "Announcements",
    description: "Banners shown to every organisation — maintenance notices, launches and updates.",
    group: "Platform",
    audience: "Platform admin",
  },
  {
    id: "ai",
    href: "/settings/ai",
    icon: Bot,
    label: "AI Platform",
    title: "AI Platform",
    description: "Provider connections and API keys, model catalogues and defaults, voices, health and usage — plus the Default Assistant every new agent starts from.",
    group: "AI & voice",
    audience: "Platform admin",
  },
  {
    id: "environment",
    href: "/settings/environment",
    icon: SlidersHorizontal,
    label: "Voice & AI runtime",
    title: "Voice & AI runtime",
    description: "ElevenLabs and Sarvam feature switches, Speech Engine, webhook secrets and platform-wide limits.",
    group: "AI & voice",
    audience: "Platform admin",
  },
  {
    id: "mcp",
    href: "/settings/mcp",
    icon: Cable,
    label: "MCP servers",
    title: "MCP servers",
    description: "Register platform-approved Model Context Protocol servers and manage their tool allowlists for Chat and Voice.",
    group: "AI & voice",
    audience: "Platform admin",
  },
  {
    id: "payments",
    href: "/settings/payments",
    icon: CreditCard,
    label: "Payments",
    title: "Payment setup",
    description: "Connect Stripe or Razorpay so customers can subscribe and pay online.",
    group: "Billing",
    audience: "Platform admin",
  },
  {
    id: "email",
    href: "/settings/email",
    icon: Mail,
    label: "Email delivery",
    title: "Email delivery",
    description: "Choose how Clara sends email — Resend or your own SMTP server — and test it with one click.",
    group: "Communications",
    audience: "Platform admin",
  },
  {
    id: "templates",
    href: "/settings/templates",
    icon: FileText,
    label: "Email templates",
    title: "Email templates",
    description: "Design the emails Clara sends — invitations, password resets and subscription notices are fully editable.",
    group: "Communications",
    audience: "Platform admin",
  },
  {
    id: "phone",
    href: "/settings/phone",
    icon: Phone,
    label: "Phone calls",
    title: "Phone calls",
    description: "Connect Twilio or Vonage so assistants can answer real phone calls.",
    group: "Channels",
    audience: "Platform admin",
  },
];

/** Filter optional features before building any settings rail or account links. */
export function availableSettingsPages(
  pages: SettingsPage[],
  features: { embeddableWidget: boolean; integrations: boolean },
): SettingsPage[] {
  return pages.filter((page) => {
    if (page.id === "embed") return features.embeddableWidget;
    if (page.id === "integrations" || page.id === "mcp" || page.id === "mcpGovernance")
      return features.integrations;
    return true;
  });
}

/**
 * A settings deep link must not be redirected while its feature flags are
 * still loading. A resolved unavailable/denied page must redirect once.
 */
export function shouldRedirectSettingsSection(
  section: SettingsSection,
  pages: readonly SettingsPage[],
  authReady: boolean,
  featureReady: boolean,
): boolean {
  return authReady && featureReady && !pages.some((page) => page.id === section);
}

/** Pages grouped in display order, skipping empty groups. */
export function groupSettingsPages(pages: SettingsPage[]): Array<{ group: SettingsGroup; pages: SettingsPage[] }> {
  return SETTINGS_GROUP_ORDER
    .map((group) => ({ group, pages: pages.filter((p) => p.group === group) }))
    .filter((g) => g.pages.length > 0);
}
