/**
 * Per-deployment availability of optional platform feature families.
 *
 * Never read tenant DB settings or NEXT_PUBLIC_* for these switches: the
 * production and development deployments must be independently configurable
 * even when they share one infrastructure host/build.
 */
export type OptionalPlatformFeature = "embeddableWidget" | "integrations";
export type FeatureAvailability = Record<OptionalPlatformFeature, boolean>;
type Environment = Record<string, string | undefined>;

const FLAGS: Record<OptionalPlatformFeature, string> = {
  embeddableWidget: "CLARA_FEATURE_EMBEDDABLE_WIDGET",
  integrations: "CLARA_FEATURE_INTEGRATIONS",
};

export function resolveFeatureAvailability(env: Environment = process.env): FeatureAvailability {
  const declared = env.CLARA_ENV?.trim().toLowerCase();
  const development = declared === "development" ||
    (declared !== "production" && env.NODE_ENV === "development");

  const enabled = (feature: OptionalPlatformFeature): boolean => {
    const raw = env[FLAGS[feature]]?.trim().toLowerCase();
    if (raw === undefined || raw === "") return development;
    if (["1", "true", "yes", "on"].includes(raw)) return true;
    if (["0", "false", "no", "off"].includes(raw)) return false;
    // Invalid values cannot accidentally enable a feature, even in dev.
    return false;
  };
  return { embeddableWidget: enabled("embeddableWidget"), integrations: enabled("integrations") };
}

export function isPlatformFeatureEnabled(feature: OptionalPlatformFeature): boolean {
  return resolveFeatureAvailability()[feature];
}

const segment = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");

/**
 * Gate only feature-owned entrypoints, never shared chat, public agent config,
 * core KB CRUD or generic worker routes consumed by unrelated features.
 */
export function featureForPath(pathname: string): OptionalPlatformFeature | null {
  if (
    segment(pathname, "/api/embed") ||
    segment(pathname, "/embed") ||
    segment(pathname, "/settings/embed") ||
    segment(pathname, "/api/platform/demo-config") ||
    /^\/api\/kbs\/[^/]+\/api-keys(?:\/|$)/.test(pathname)
  ) return "embeddableWidget";

  if (
    segment(pathname, "/api/integrations") ||
    segment(pathname, "/api/whatsapp") ||
    segment(pathname, "/api/webhooks/whatsapp") ||
    segment(pathname, "/api/cron/whatsapp-connection-health") ||
    segment(pathname, "/api/cron/whatsapp-daily-briefings") ||
    /^\/api\/orgs\/[^/]+\/(?:mcp|mcp-servers|integrations)(?:\/|$)/.test(pathname) ||
    /^\/api\/orgs\/[^/]+\/agents\/[^/]+\/(?:mcp-tools|integrations|messaging)(?:\/|$)/.test(pathname) ||
    /^\/api\/platform\/(?:integrations|mcp-servers|mcp-settings)(?:\/|$)/.test(pathname) ||
    segment(pathname, "/settings/integrations") ||
    segment(pathname, "/settings/mcp") ||
    /^\/orgs\/[^/]+\/integrations(?:\/|$)/.test(pathname) ||
    /^\/orgs\/[^/]+\/agents\/[^/]+\/(?:integrations|mcp|messaging)(?:\/|$)/.test(pathname)
  ) return "integrations";
  return null;
}
