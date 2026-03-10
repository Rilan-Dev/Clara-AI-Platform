export const APP_COOKIE_NAME = "clara_omen_token";
export const DEFAULT_ORG_ID = "10000000-0000-0000-0000-000000000001";

export function getOrgId() {
  return process.env.NEXT_PUBLIC_ORG_ID ?? process.env.NEXT_PUBLIC_CLARA_ORG_ID ?? DEFAULT_ORG_ID;
}

export function getBackendUrl() {
  return process.env.CLARA_BACKEND_URL ?? "http://localhost:3000";
}

export function getOrgName() {
  return process.env.NEXT_PUBLIC_ORG_NAME ?? "Omen United Insurance";
}

export function getPlanLabel() {
  return process.env.NEXT_PUBLIC_PLAN ?? "pro";
}

export function getPlatformAdminUrl() {
  return process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3000/admin";
}
