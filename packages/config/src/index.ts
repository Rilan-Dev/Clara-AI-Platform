export interface PortalConfigOptions {
  cookieName: string;
  defaultOrgId: string;
  defaultOrgName: string;
  defaultPlanLabel: string;
  defaultBackendUrl?: string;
  defaultAdminUrl?: string;
  defaultPricingUrl?: string;
}

export function createPortalConfig(options: PortalConfigOptions) {
  const backendUrl = options.defaultBackendUrl ?? "http://localhost:3000";
  const adminUrl = options.defaultAdminUrl ?? "http://localhost:3000/admin";
  const pricingUrl = options.defaultPricingUrl ?? "http://localhost:3000/pricing";

  return {
    APP_COOKIE_NAME: options.cookieName,
    DEFAULT_ORG_ID: options.defaultOrgId,
    getOrgId() {
      return process.env.NEXT_PUBLIC_ORG_ID ?? process.env.NEXT_PUBLIC_CLARA_ORG_ID ?? options.defaultOrgId;
    },
    getBackendUrl() {
      return process.env.CLARA_BACKEND_URL ?? backendUrl;
    },
    getOrgName() {
      return process.env.NEXT_PUBLIC_ORG_NAME ?? options.defaultOrgName;
    },
    getPlanLabel() {
      return process.env.NEXT_PUBLIC_PLAN ?? options.defaultPlanLabel;
    },
    getPlatformAdminUrl() {
      return process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? adminUrl;
    },
    getPricingUrl() {
      return process.env.NEXT_PUBLIC_PLATFORM_PRICING_URL ?? pricingUrl;
    },
  };
}
