import { cookies } from "next/headers";

export const ORG_ID  = process.env.CLARA_ORG_ID  ?? "";
export const BACKEND = process.env.CLARA_BACKEND_URL ?? "http://localhost:3000";

export function getOrgId(): string {
  return ORG_ID;
}
