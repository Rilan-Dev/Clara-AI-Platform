import { createPortalConfig } from "@clara/config";

const config = createPortalConfig({
  cookieName: "clara_omen_token",
  defaultOrgId: "10000000-0000-0000-0000-000000000001",
  defaultOrgName: "Omen United Insurance",
  defaultPlanLabel: "pro",
  defaultAdminUrl: "http://localhost:3000/admin",
});

export const APP_COOKIE_NAME = config.APP_COOKIE_NAME;
export const DEFAULT_ORG_ID = config.DEFAULT_ORG_ID;
export const getOrgId = config.getOrgId;
export const getBackendUrl = config.getBackendUrl;
export const getOrgName = config.getOrgName;
export const getPlanLabel = config.getPlanLabel;
export const getPlatformAdminUrl = config.getPlatformAdminUrl;
