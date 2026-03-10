export const ORG_ID  = import.meta.env.VITE_ORG_ID ?? "10000000-0000-0000-0000-000000000001";
export const BACKEND = "/api/proxy";

export function getOrgId(): string {
  return ORG_ID;
}
