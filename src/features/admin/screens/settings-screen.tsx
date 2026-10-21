"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot,
  ChevronRight,
  UserRound,
} from "lucide-react";
import { EditProfileModal } from "@/components/admin/EditProfileModal";
import { EmbedApiKeyPanel } from "@/components/admin/EmbedApiKeyPanel";
import { EmailDeliveryPanel } from "@/components/admin/EmailDeliveryPanel";
import { EmailTemplatesPanel } from "@/components/admin/EmailTemplatesPanel";
import { PaymentGatewayPanel } from "@/components/admin/PaymentGatewayPanel";
import { PlatformAppearancePanel } from "@/components/admin/PlatformAppearancePanel";
import { PlatformEnvPanel } from "@/components/admin/PlatformEnvPanel";
import { AIPlatformSection } from "@/components/admin/ai-platform/AIPlatformSection";
import { useAuth } from "@/modules/admin-ui/hooks";
import {
  ACCOUNT_PAGE,
  ADMIN_SETTINGS_PAGES,
  availableSettingsPages,
  groupSettingsPages,
  type SettingsPage,
  type SettingsSection,
} from "@/features/admin/settings-nav";
import { usePlatformFeatures } from "@/features/admin/use-platform-features";

// ── Section model ────────────────────────────────────────────────────────────
// The page list, labels and grouping live in settings-nav.ts — shared with
// the sidebar so they can never drift apart.
type SectionDef = SettingsPage;
export type { SettingsSection };
export const ADMIN_SETTINGS_SECTIONS: SectionDef[] = ADMIN_SETTINGS_PAGES;

/** Organisation users — personal account only. Assistant persona settings
 *  are platform-level defaults now; orgs tune their own agents. */
export const ORG_SETTINGS_SECTIONS: SectionDef[] = [ACCOUNT_PAGE];

// ── Screen ───────────────────────────────────────────────────────────────────

export default function SettingsScreen({ section }: { section: SettingsSection }) {
  const { user, loading } = useAuth();
  const isSuperAdmin = user?.isSuperAdmin ?? false;
  const [showProfile, setShowProfile] = useState(false);
  const features = usePlatformFeatures();
  const router = useRouter();

  const sections = isSuperAdmin ? availableSettingsPages(ADMIN_SETTINGS_SECTIONS, features) : ORG_SETTINGS_SECTIONS;
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
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/25 hover:text-foreground"
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

        {section === "appearance" && <PlatformAppearancePanel />}

        {section === "embed" && (
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-7 shadow-sm">
            <EmbedApiKeyPanel />
          </div>
        )}

        {section === "ai" && <AIPlatformSection />}

        {section === "environment" && (
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-7 shadow-sm">
            <PlatformEnvPanel sections={["ai"]} />
          </div>
        )}

        {section === "phone" && (
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-7 shadow-sm">
            <PlatformEnvPanel sections={["phone"]} />
          </div>
        )}

        {section === "payments" && (
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-7 shadow-sm">
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

// ── Platform AI section is now AIPlatformSection (Providers & Models + Default
// Assistant workspace). The legacy per-organisation AI configuration jump list
// and the standalone ElevenLabs status card were removed with the AI
// configuration migration (Stage K): organisation-level AI configuration no
// longer exists, and provider health/usage live inside each provider's
// workspace drawer.

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
        <div className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-gradient-to-br from-indigo-500/15 to-violet-500/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">{title}</h1>
            {audience && (
              <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-primary">
                {audience}
              </span>
            )}
          </div>
          <p className="mt-1 sm:mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground line-clamp-1 sm:line-clamp-none">{description}</p>
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
          <div className="h-12 w-12 animate-pulse rounded-2xl bg-muted" />
          <div className="space-y-2">
            <div className="h-5 w-48 animate-pulse rounded-lg bg-muted" />
            <div className="h-3.5 w-72 animate-pulse rounded-lg bg-muted" />
          </div>
        </div>
        <div className="h-40 animate-pulse rounded-2xl bg-muted/50" />
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
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-5">
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover ring-2 ring-border" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-lg font-semibold text-white">
            {user.fullName.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <p className="truncate text-base font-semibold text-foreground">{user.fullName}</p>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-primary">
              {roleLabel}
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground/70">{user.email}</p>
        </div>
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/25 hover:text-foreground"
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

      {groupSettingsPages(quickLinks).map(({ group, pages }) => (
      <section key={group} aria-labelledby={`settings-group-${group}`} className="space-y-3">
        <h2 id={`settings-group-${group}`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {pages.map((s) => (
          <Link
            key={s.id}
            href={s.href}
            className="group rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm transition-colors hover:border-primary/30 hover:bg-muted/50"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <s.icon className="h-4 w-4 text-primary" />
            </div>
            <h3 className="mt-3 text-sm font-medium text-foreground">{s.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground/70">{s.description}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary transition-transform group-hover:translate-x-0.5">
              Open <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        ))}
      </div>
      </section>
      ))}
    </div>
  );
}
