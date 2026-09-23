// ── Workspace page furniture ─────────────────────────────────────────────────
// The sidebar owns agent navigation (Agents > Overview / Main / FAQ /
// Knowledge / Tools / Branches / Publish) and the topbar owns the version /
// deploy cluster (Main vN · Draft changes · Published vN · Draft saved ·
// Preview · Publish update) — see admin-shell.tsx and
// layouts/agent-topbar.tsx. The shell itself only keeps phone navigation
// (the rail is desktop-only) and the platform-default notice.

/** Horizontal section tabs for phones — the sidebar rail is desktop-only. */
function AgentMobileTabs() {
  const { agentId, orgId } = useAgentsWorkspace();
  const pathname = usePathname();
  if (!agentId) return null;

  const base = `/orgs/${orgId}/agents/${agentId}`;
  const tabs: Array<{ href: string; label: string; exact?: boolean }> = [
    { href: base, label: "Overview", exact: true },
    { href: `${base}/config`, label: "Main" },
    { href: `${base}/faq`, label: "FAQ" },
    { href: `${base}/knowledge`, label: "Knowledge" },
    { href: `${base}/tools`, label: "Tools" },
    { href: `${base}/versions`, label: "Branches" },
    { href: `${base}/publish`, label: "Publish" },
  ];

  return (
    <nav
      aria-label="Agent sections"
      className="sticky top-14 z-20 flex gap-1 overflow-x-auto border-b border-border bg-background/90 px-4 py-2 backdrop-blur-md md:hidden"
    >
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "border border-primary/20 bg-primary/10 text-primary"
                : "border border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** §22 — new platform default available (explicit review/apply, never silent). */
function DefaultUpdateBanner() {
  const { agentId, orgId, context } = useAgentsWorkspace();
  const [defaultUpdate, setDefaultUpdate] = useState<{
    agentDefaultVersion: number | null;
    currentPlatformVersion: number | null;
  } | null>(null);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (!context?.defaultAssistantUpdate?.updateAvailable) {
      setDefaultUpdate(null);
      return;
    }
    void checkAgentDefaultUpdate(agentId ?? "")
      .then((r) =>
        setDefaultUpdate(
          r.updateAvailable
            ? { agentDefaultVersion: r.agentDefaultVersion, currentPlatformVersion: r.currentPlatformVersion }
            : null,
        ),
      )
      .catch(() => setDefaultUpdate(null));
  }, [agentId, context?.defaultAssistantUpdate?.updateAvailable]);

  if (!defaultUpdate || dismissing) return null;

  return (
    <div className="px-4 pt-4 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-primary">New platform default available.</span>{" "}
          Your agent was created from v{defaultUpdate.agentDefaultVersion ?? "?"}. Current platform default is
          v{defaultUpdate.currentPlatformVersion ?? "?"}.
        </p>
        <div className="flex items-center gap-2">
          <Link
            href={`/orgs/${orgId}/agents/${agentId}/versions`}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/30"
          >
            Review changes
          </Link>
          <button
            type="button"
            onClick={() => setDismissing(true)}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            Keep current
          </button>
        </div>
      </div>
    </div>
  );
}

