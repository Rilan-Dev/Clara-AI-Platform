// Inlined portal config — no workspace package dependency needed
const COOKIE_NAME        = "clara_omen_token";
const DEFAULT_ORG_ID_VAL = "10000000-0000-0000-0000-000000000001";
const DEFAULT_ORG_NAME   = "Omen United Insurance";
const DEFAULT_PLAN_LABEL = "pro";
const DEFAULT_BACKEND_URL = "http://localhost:3000";
const DEFAULT_ADMIN_URL   = "http://localhost:3000/admin";

type ClientEnv = {
  NEXT_PUBLIC_ORG_ID?: string;
  NEXT_PUBLIC_ORG_NAME?: string;
  NEXT_PUBLIC_PLAN?: string;
  NEXT_PUBLIC_PLATFORM_ADMIN_URL?: string;
};

function getClientEnv<K extends keyof ClientEnv>(key: K): ClientEnv[K] | undefined {
  return process.env[key];
}

export const APP_COOKIE_NAME = COOKIE_NAME;
export const DEFAULT_ORG_ID  = DEFAULT_ORG_ID_VAL;

export function getOrgId(): string {
  return (
    getClientEnv("NEXT_PUBLIC_ORG_ID") ||
    DEFAULT_ORG_ID_VAL
  );
}

export function getBackendUrl(): string {
  return (
    (typeof process !== "undefined" && process.env?.CLARA_BACKEND_URL) ||
    DEFAULT_BACKEND_URL
  );
}

export function getOrgName(): string {
  return (
    getClientEnv("NEXT_PUBLIC_ORG_NAME") ||
    DEFAULT_ORG_NAME
  );
}

export function getPlanLabel(): string {
  return (
    getClientEnv("NEXT_PUBLIC_PLAN") ||
    DEFAULT_PLAN_LABEL
  );
}

export function getPlatformAdminUrl(): string {
  return (
    getClientEnv("NEXT_PUBLIC_PLATFORM_ADMIN_URL") ||
    DEFAULT_ADMIN_URL
  );
}
