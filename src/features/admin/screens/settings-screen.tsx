"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot,
  ChevronRight,
  CreditCard,
  KeyRound,
  Mail,
  UserRound,
} from "lucide-react";
import { EditProfileModal } from "@/components/admin/EditProfileModal";
import { EmbedApiKeyPanel } from "@/components/admin/EmbedApiKeyPanel";
import { EmailDeliveryPanel } from "@/components/admin/EmailDeliveryPanel";
import { EmailTemplatesPanel } from "@/components/admin/EmailTemplatesPanel";
import { PaymentGatewayPanel } from "@/components/admin/PaymentGatewayPanel";
import { PlatformAssistantDefaultsEditor } from "@/components/admin/PlatformAssistantDefaultsEditor";
import { PlatformEnvPanel } from "@/components/admin/PlatformEnvPanel";
import { apiUrl } from "@/lib/runtime";
import { withAuthHeaders } from "@/lib/client-auth";
import { useAuth, usePlatformAssistantDefaults } from "@/modules/admin-ui/hooks";

// ── Section model ────────────────────────────────────────────────────────────
// Each entry pairs the sidebar label (what users see in the left rail) with a
// plain-English title + description shown on the page itself. Copy is written
// for non-technical readers: short sentences, everyday words, zero jargon.
//
// Role split (platform-admin isolation):
//   - Platform admins: Account / AI Configuration / Embed Key / Payments.
//     AI Configuration holds the PLATFORM DEFAULT assistant persona
//     (Identity, Behaviour, Language, Voice) — starting values for newly
//     onboarding agents. Existing org-owned values are never
//     rewritten.
//   - Organisation users: Account only. Identity / Behaviour / Language /
//     Voice are NOT org-level settings any more — orgs tune their own
//     agents and knowledge bases.

export type SettingsSection = "account" | "ai" | "embed" | "payments" | "email" | "templates";

type SectionDef = {
  id: SettingsSection;
  href: string;
  icon: typeof Bot;
  label: string;      // shown in the sidebar dropdown
  title: string;      // page heading — friendly wording
  description: string; // one-sentence plain-English explainer
  audience: string;   // who this section is for
};

const ACCOUNT_SECTION: SectionDef = {
  id: "account",
  href: "/settings/account",
  icon: UserRound,
  label: "Account",
  title: "Your account",
  description: "Update your name, profile photo, and personal details.",
  audience: "Everyone",
};

/** Platform admins — onboarding defaults, billing and platform keys. */
export const ADMIN_SETTINGS_SECTIONS: SectionDef[] = [
  ACCOUNT_SECTION,
  {
    id: "ai",
    href: "/settings/ai",
    icon: Bot,
    label: "AI Configuration",
    title: "Default assistant setup",
    description:
      "Set the identity, behaviour, languages and voice that every new agent starts with. Existing ones are never changed.",
    audience: "Platform admin",
  },
  {
    id: "embed",
    href: "/settings/embed",
    icon: KeyRound,
    label: "Embed Key",
    title: "Website chat key",
    description:
      "Manage the security key that lets the chat box on your public website talk to Clara.",
    audience: "Platform admin",
  },
  {
    id: "payments",
    href: "/settings/payments",
    icon: CreditCard,
    label: "Payments",
    title: "Payment setup",
    description:
      "Connect Stripe or Razorpay so customers can subscribe to your service and pay online.",
    audience: "Platform admin",
  },
  {
    id: "email",
    href: "/settings/email",
    icon: Mail,
    label: "Email Delivery",
    title: "Email delivery",
    description:
      "Choose how Clara sends email — Resend or your own SMTP server — and test it with one click.",
    audience: "Platform admin",
  },
  {
    id: "templates",
    href: "/settings/templates",
    icon: Mail,
    label: "Email Templates",
    title: "Email templates",
    description:
      "Design the emails Clara sends — invitations, password resets and subscription notices are fully editable.",
    audience: "Platform admin",
  },
];

/** Organisation users — personal account only. Assistant persona settings
 *  are platform-level defaults now; orgs tune their own agents. */
export const ORG_SETTINGS_SECTIONS: SectionDef[] = [ACCOUNT_SECTION];

// ── Screen ───────────────────────────────────────────────────────────────────

export default function SettingsScreen({ section }: { section: SettingsSection }) {
  const { user, loading } = useAuth();
  const isSuperAdmin = user?.isSuperAdmin ?? false;
  const [showProfile, setShowProfile] = useState(false);
  const router = useRouter();

  const sections  = isSuperAdmin ? ADMIN_SETTINGS_SECTIONS : ORG_SETTINGS_SECTIONS;
  const active    = sections.find((s) => s.id === section) ?? sections[0];

  // Steer users away from sections that do not belong to their role:
  //  - organisation users have no AI Configuration (it is the platform-level
  //    defaults page now; orgs tune their own agents)
  //  - organisation users have no Embed Key / Payments (platform-level tools)
  useEffect(() => {
    if (loading || !user) return;
    const allowed = sections.some((s) => s.id === section);
    if (!allowed) router.replace(sections[0].href);
  }, [loading, user, isSuperAdmin, section, sections, router]);

  // While sign-in state is being checked, show a calm skeleton instead of
  // flashing the wrong view (previously admins saw the org-user page blink).
  if (loading) return <SettingsSkeleton />;
  if (!user) return null;

  // Mobile section pills — on phones the main sidebar is a hidden drawer,
  // so sections stay reachable without opening it. Desktop nav lives in
  // the sidebar dropdown.
  const SectionPills = (
    <nav aria-label="Settings sections" className="md:hidden -mx-4 sm:-mx-6 mb-6 sm:mb-8 px-4 sm:px-6">
      <ul className="flex gap-2 overflow-x-auto pb-1 scrollbar-none rail-fade-r">
        {sections.map((s) => {
          const isActive = s.id === section;
          return (
            <li key={s.id} className="shrink-0">
              <Link
                href={s.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "border-indigo-500/40 bg-indigo-500/15 text-indigo-200"
                    : "border-white/10 bg-white/[0.02] text-white/50 hover:border-white/25 hover:text-white/80"
                }`}
              >
                <s.icon className="h-3.5 w-3.5" />
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  // ── Organisation users ──────────────────────────────────────────────────────
  // Org users only have their personal account here. Assistant persona
  // settings (Identity / Behaviour / Language / Voice) are platform-level
  // defaults now — orgs tune their own agents and knowledge bases.
  if (!isSuperAdmin) {
    return (
      <div className="p-4 sm:p-6 lg:p-10">
        <div>
          {SectionPills}

          <PageHeader
            icon={active.icon}
            title={active.title}
            description={active.description}
            audience={active.audience}
          />

          {section === "account" && (
            <OrgAccountPanel user={user} onEdit={() => setShowProfile(true)} />
          )}

          {showProfile && user && (
            <EditProfileModal
              user={user}
              onClose={() => setShowProfile(false)}
              onSaved={() => setShowProfile(false)}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Platform admin ─────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 lg:p-10">
      <div>
        {SectionPills}

        <PageHeader
          icon={active.icon}
          title={active.title}
          description={active.description}
          audience={active.audience}
        />

        {section === "account" && (
          <AccountPanel
            user={user}
            onEdit={() => setShowProfile(true)}
            sections={sections}
          />
        )}

        {section === "embed" && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 sm:p-7">
            <EmbedApiKeyPanel />
          </div>
        )}

        {section === "ai" && <PlatformAIDefaultsSection />}

        {section === "payments" && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 sm:p-7">
            <PaymentGatewayPanel />
          </div>
        )}

        {section === "email" && <EmailDeliveryPanel />}

        {section === "templates" && <EmailTemplatesPanel />}
      </div>

      {user && showProfile && (
        <EditProfileModal
          user={user}
          onClose={() => setShowProfile(false)}
          onSaved={() => setShowProfile(false)}
        />
      )}
    </div>
  );
}

// ── Platform-default assistant configuration ─────────────────────────────────

function PlatformAIDefaultsSection() {
  const { defaults, loading, error, save } = usePlatformAssistantDefaults();

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.08] to-violet-500/[0.04] p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-white">How platform defaults work</h2>
        <p className="mt-2 text-xs leading-relaxed text-white/45">
          Every newly onboarding agent starts with these identity, behaviour,
          language and voice values. The values are copied at creation time, so changing them
          later only affects future onboarding — existing agents keep exactly what
          their organisations already configured.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-12 rounded-2xl bg-white/[0.04] animate-pulse" />
          <div className="h-[28rem] rounded-2xl bg-white/[0.04] animate-pulse" />
        </div>
      ) : (
        <PlatformAssistantDefaultsEditor defaults={defaults} onSave={save} />
      )}
      {error && <p className="text-sm text-rose-400">{error}</p>}

      {/* Platform AI provider keys & default models — OpenAI / Gemini /
          ElevenLabs. The missing provider-switching + API-key surface the
          admin console lost in the redesign, restored here. */}
      <PlatformAIProvidersPanel />
    </div>
  );
}

// ── Platform AI providers: API keys, models, ElevenLabs status ────────────────

function PlatformAIProvidersPanel() {
  const [orgs, setOrgs] = useState<{ id: string; name: string; slug: string }[]>([]);

  useEffect(() => {
    fetch(apiUrl("/api/platform/orgs?perPage=100"), { headers: withAuthHeaders() })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { orgs?: { id: string; name: string; slug: string }[] };
        setOrgs(data.orgs ?? []);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.06] to-transparent p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-white">AI providers &amp; API keys</h2>
        <p className="mt-2 text-xs leading-relaxed text-white/45">
          The platform-level keys and default models for OpenAI, Google Gemini and ElevenLabs.
          Organisations pick their own provider and models in
          <span className="text-white/70"> Organisation → Settings → AI Providers</span>;
          what you set here is the default everything starts from.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-white/35">
          ElevenLabs is a <span className="text-white/70">voice-only</span> provider — it speaks
          and listens, while Clara&apos;s own AI answers. Documents and knowledge bases never
          leave this platform.
        </p>
      </div>

      <ElevenLabsStatusCard />

      <PlatformEnvPanel />

      {/* Per-organisation AI configuration — the operator's jump list. */}
      {orgs.length > 0 && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-white">Organisation AI configuration</h3>
          <p className="mt-1 text-xs text-white/40">
            Switch providers, models and voices for a specific organisation.
          </p>
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            {orgs.map((org) => (
              <Link
                key={org.id}
                href={`/orgs/${org.id}/settings`}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5 hover:bg-white/[0.05] hover:border-indigo-500/25 transition-all group"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate group-hover:text-indigo-300 transition-colors">{org.name}</p>
                  <p className="text-xs text-white/35 font-mono truncate">/{org.slug}</p>
                </div>
                <span className="text-xs text-indigo-400 shrink-0 group-hover:text-indigo-300">Configure →</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ElevenLabs connection status (operator health card) ──────────────────────

function ElevenLabsStatusCard() {
  const [status, setStatus] = useState<{
    connected: boolean;
    reason?: string;
    tier?: string;
    characterCount?: number;
    characterLimit?: number;
    characterUsagePercent?: number | null;
    voiceLimit?: number;
    canUseInstantCloning?: boolean;
    enabled?: boolean;
    conversationalAI?: boolean;
    voiceCloning?: boolean;
    voiceDesign?: boolean;
    creditAlert?: { thresholdPct: number; usagePercent: number | null; crossed: boolean; alerted: boolean };
    defaultTtsModel?: string;
    defaultSttModel?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(apiUrl("/api/admin/elevenlabs/status"), {
        headers: withAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setStatus(data);
    } catch {
      setStatus({ connected: false, reason: "Status request failed." });
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`h-2.5 w-2.5 rounded-full ${status?.connected ? "bg-emerald-400" : "bg-rose-400"}`} />
          <div>
            <h3 className="text-sm font-semibold text-white">ElevenLabs connection</h3>
            <p className="text-xs text-white/40">
              {loading ? "Checking…" : status?.connected ? `Tier: ${status.tier ?? "unknown"}` : status?.reason}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={checking || loading}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.04] disabled:opacity-50"
        >
          {checking ? "Testing…" : "Test connection"}
        </button>
      </div>
      {status?.connected && (
        <div className="mt-4 grid sm:grid-cols-3 gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-white/35">Credits used</p>
            <p className="mt-1 text-sm text-white/80">
              {(status.characterCount ?? 0).toLocaleString()}
              {status.characterLimit ? ` / ${status.characterLimit.toLocaleString()}` : ""}
            </p>
            {status.characterUsagePercent != null && (
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    status.creditAlert?.crossed || status.characterUsagePercent > 80 ? "bg-amber-400" : "bg-cyan-400"
                  }`}
                  style={{ width: `${Math.min(100, status.characterUsagePercent)}%` }}
                />
              </div>
            )}
            {/* V6 credit-burn alerting — one-line operator signal. */}
            {status.creditAlert?.crossed && (
              <p className="mt-1.5 text-[11px] text-amber-300">
                Burn alert: {status.creditAlert.usagePercent}% consumed (threshold {status.creditAlert.thresholdPct}%)
                {status.creditAlert.alerted ? " — super admins notified." : ""}
              </p>
            )}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-white/35">Workspace voices</p>
            <p className="mt-1 text-sm text-white/80">{status.voiceLimit ?? "—"}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-white/35">Defaults</p>
            <p className="mt-1 text-sm text-white/80 font-mono text-xs">
              {status.defaultTtsModel} · {status.defaultSttModel}
            </p>
          </div>
        </div>
      )}
      {/* Feature flags — always visible so operators see the Mode B / studio
          kill-switch states even before a key is configured. */}
      {status && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
          <span className={status.connected ? "rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-emerald-300" : "rounded-full border border-rose-400/30 bg-rose-400/10 px-2.5 py-0.5 text-rose-300"}>
            {status.connected ? "Voice enabled" : "Voice off"}
          </span>
          <span className={status.conversationalAI ? "rounded-full border border-indigo-400/30 bg-indigo-400/10 px-2.5 py-0.5 text-indigo-300" : "rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-white/40"}>
            Conversational AI (Mode B): {status.conversationalAI ? "on" : "off"}
          </span>
          <span className={status.voiceCloning ? "rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-0.5 text-violet-300" : "rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-white/40"}>
            Cloning: {status.voiceCloning ? "on" : "off"}
          </span>
          <span className={status.voiceDesign ? "rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-0.5 text-cyan-300" : "rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-white/40"}>
            Voice Design: {status.voiceDesign ? "on" : "off"}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Shared pieces ────────────────────────────────────────────────────────────

function PageHeader({
  icon: Icon,
  title,
  description,
  audience,
}: {
  icon: typeof Bot;
  title: string;
  description: string;
  audience?: string;
}) {
  return (
    <header className="mb-6 sm:mb-8">
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-gradient-to-br from-indigo-500/15 to-violet-500/10">
          <Icon className="h-5 w-5 text-indigo-300" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-white">{title}</h1>
            {audience && (
              <span className="rounded-full border border-indigo-500/25 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-indigo-300">
                {audience}
              </span>
            )}
          </div>
          <p className="mt-1 sm:mt-1.5 max-w-2xl text-sm leading-relaxed text-white/45 line-clamp-1 sm:line-clamp-none">{description}</p>
        </div>
      </div>
    </header>
  );
}

function SettingsSkeleton() {
  return (
    <div className="p-4 sm:p-6 lg:p-10">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 animate-pulse rounded-2xl bg-white/[0.04]" />
          <div className="space-y-2">
            <div className="h-5 w-48 animate-pulse rounded-lg bg-white/[0.04]" />
            <div className="h-3.5 w-72 animate-pulse rounded-lg bg-white/[0.04]" />
          </div>
        </div>
        <div className="h-40 animate-pulse rounded-2xl bg-white/[0.02]" />
      </div>
    </div>
  );
}

type SettingsUser = {
  email: string;
  fullName: string;
  avatarUrl: string | null;
  isSuperAdmin: boolean;
} | null;

function ProfileCard({
  user,
  onEdit,
  roleLabel,
}: {
  user: SettingsUser;
  onEdit: () => void;
  roleLabel: string;
}) {
  if (!user) return null;
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-5">
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover ring-2 ring-white/10" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-lg font-semibold text-white">
            {user.fullName.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <p className="truncate text-base font-semibold text-white">{user.fullName}</p>
            <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-300">
              {roleLabel}
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm text-white/40">{user.email}</p>
        </div>
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:border-white/25 hover:text-white"
        >
          <UserRound className="h-4 w-4" /> Edit profile
        </button>
      </div>
    </div>
  );
}

/** Organisation user's account page — profile + link to their AI setup. */
function OrgAccountPanel({
  user,
  onEdit,
}: {
  user: SettingsUser;
  onEdit: () => void;
}) {
  return (
    <div className="space-y-6">
      <ProfileCard user={user} onEdit={onEdit} roleLabel="Member" />

    </div>
  );
}

/** Platform admin's account page — profile + platform tool quick links. */
function AccountPanel({
  user,
  onEdit,
  sections,
}: {
  user: SettingsUser;
  onEdit: () => void;
  sections: SectionDef[];
}) {
  const quickLinks = sections.filter((s) => s.id !== "account");

  return (
    <div className="space-y-6">
      <ProfileCard user={user} onEdit={onEdit} roleLabel="Super Admin" />

      <div className="grid gap-4 sm:grid-cols-2">
        {quickLinks.map((s) => (
          <Link
            key={s.id}
            href={s.href}
            className="group rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5 transition-colors hover:border-indigo-500/30 hover:bg-white/[0.03]"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10">
              <s.icon className="h-4 w-4 text-indigo-300" />
            </div>
            <h3 className="mt-3 text-sm font-medium text-white">{s.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-white/40">{s.description}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-indigo-300 transition-transform group-hover:translate-x-0.5">
              Open <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
