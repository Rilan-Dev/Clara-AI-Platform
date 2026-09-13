"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot,
  Building2,
  ChevronRight,
  CreditCard,
  KeyRound,
  UserRound,
} from "lucide-react";
import { EditProfileModal } from "@/components/admin/EditProfileModal";
import { EmbedApiKeyPanel } from "@/components/admin/EmbedApiKeyPanel";
import { PaymentGatewayPanel } from "@/components/admin/PaymentGatewayPanel";
import { OrgAISettingsEditor } from "@/components/admin/OrgAISettingsEditor";
import { useAuth, useOrg, useOrgAISettings } from "@/modules/admin-ui/hooks";

// ── Section model ────────────────────────────────────────────────────────────
// Each entry pairs the sidebar label (what users see in the left rail) with a
// plain-English title + description shown on the page itself. Copy is written
// for non-technical readers: short sentences, everyday words, zero jargon.
//
// Role split (platform-admin isolation):
//   - Platform admins: Account / Embed Key / Payments — billing and platform
//     keys only. They never see organisation content or AI configuration.
//   - Organisation users: Account / AI Configuration — their own
//     organisation's assistant setup (identity, behaviour, language, voice,
//     model and keys).

export type SettingsSection = "account" | "ai" | "embed" | "payments";

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

/** Platform admins — billing and platform keys only. */
export const ADMIN_SETTINGS_SECTIONS: SectionDef[] = [
  ACCOUNT_SECTION,
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
];

/** Organisation users — their own organisation's AI setup. */
export const ORG_SETTINGS_SECTIONS: SectionDef[] = [
  ACCOUNT_SECTION,
  {
    id: "ai",
    href: "/settings/ai",
    icon: Bot,
    label: "AI Configuration",
    title: "Your AI assistant setup",
    description:
      "Choose how your organisation's assistant behaves — its name, personality, languages, voice, and how smart it should be.",
    audience: "Your organisation",
  },
];

// ── Screen ───────────────────────────────────────────────────────────────────

export default function SettingsScreen({ section }: { section: SettingsSection }) {
  const { user, loading, primaryOrgId } = useAuth();
  const isSuperAdmin = user?.isSuperAdmin ?? false;
  const [showProfile, setShowProfile] = useState(false);
  const router = useRouter();

  const sections  = isSuperAdmin ? ADMIN_SETTINGS_SECTIONS : ORG_SETTINGS_SECTIONS;
  const active    = sections.find((s) => s.id === section) ?? sections[0];

  // Steer users away from sections that do not belong to their role:
  //  - platform admins have no AI Configuration (orgs configure their own AI)
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
    <nav aria-label="Settings sections" className="md:hidden -mx-6 mb-8 px-6">
      <ul className="flex gap-2 overflow-x-auto pb-1">
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
  // Org users manage their own assistant identity/behaviour/language/voice and
  // model — this is their AI Configuration section.
  if (!isSuperAdmin) {
    return (
      <div className="p-6 lg:p-10">
        <div className="mx-auto max-w-5xl">
          {SectionPills}

          <PageHeader
            icon={active.icon}
            title={active.title}
            description={active.description}
            audience={active.audience}
          />

          {section === "account" && (
            <OrgAccountPanel
              user={user}
              onEdit={() => setShowProfile(true)}
              aiSection={sections.find((s) => s.id === "ai")}
            />
          )}

          {section === "ai" && (
            <OrgAISection orgId={primaryOrgId} />
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
    <div className="p-6 lg:p-10">
      <div className="mx-auto max-w-5xl">
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

        {section === "payments" && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 sm:p-7">
            <PaymentGatewayPanel />
          </div>
        )}
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

// ── Org-user AI configuration ───────────────────────────────────────────────

function OrgAISection({ orgId }: { orgId: string | null }) {
  const { data: org } = useOrg(orgId ?? "");
  const { settings, loading, error, save } = useOrgAISettings(orgId ?? "");

  if (!orgId) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10">
          <Building2 className="h-5 w-5 text-indigo-300" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-white">No organisation yet</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/45">
          Your AI assistant is configured per organisation. Once you join an organisation, its
          assistant settings will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.08] to-violet-500/[0.04] p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-white">
          Everything here applies to {org?.name ?? "your organisation"} only
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-white/45">
          These settings power every assistant your organisation runs — the name it introduces
          itself with, the way it answers, the languages it speaks, its voice, and the AI model
          behind it all. Changes take effect for your organisation immediately.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-12 rounded-2xl bg-white/[0.04] animate-pulse" />
          <div className="h-[28rem] rounded-2xl bg-white/[0.04] animate-pulse" />
        </div>
      ) : (
        <OrgAISettingsEditor orgName={org?.name ?? "your organisation"} settings={settings} onSave={save} />
      )}
      {error && <p className="text-sm text-rose-400">{error}</p>}
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
    <header className="mb-8">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-gradient-to-br from-indigo-500/15 to-violet-500/10">
          <Icon className="h-5 w-5 text-indigo-300" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-white">{title}</h1>
            {audience && (
              <span className="rounded-full border border-indigo-500/25 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-indigo-300">
                {audience}
              </span>
            )}
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-white/45">{description}</p>
        </div>
      </div>
    </header>
  );
}

function SettingsSkeleton() {
  return (
    <div className="p-6 lg:p-10">
      <div className="mx-auto max-w-5xl space-y-6">
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
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
      <div className="flex flex-wrap items-center gap-5">
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover ring-2 ring-white/10" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-lg font-semibold text-white">
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
  aiSection,
}: {
  user: SettingsUser;
  onEdit: () => void;
  aiSection?: SectionDef;
}) {
  return (
    <div className="space-y-6">
      <ProfileCard user={user} onEdit={onEdit} roleLabel="Member" />

      {aiSection && (
        <Link
          href={aiSection.href}
          className="group block rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 transition-colors hover:border-indigo-500/30 hover:bg-white/[0.03]"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10">
            <aiSection.icon className="h-4 w-4 text-indigo-300" />
          </div>
          <h3 className="mt-3 text-sm font-medium text-white">{aiSection.title}</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-white/40">{aiSection.description}</p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-indigo-300 transition-transform group-hover:translate-x-0.5">
            Open <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </Link>
      )}
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
            className="group rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 transition-colors hover:border-indigo-500/30 hover:bg-white/[0.03]"
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
