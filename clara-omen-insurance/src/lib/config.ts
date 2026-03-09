export const ORG_ID  = import.meta.env.VITE_ORG_ID ?? "";
export const BACKEND = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export function getOrgId(): string {
  return ORG_ID;
}
