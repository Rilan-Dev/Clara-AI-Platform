import type { IntegrationDefinition, IntegrationCategory } from "../types";
import { REGISTRY as CURATED_REGISTRY } from "../doable-registry";
import { COMMUNICATION_INTEGRATIONS } from "./communication";
import { PRODUCTIVITY_PART1 } from "./productivity-part1";
import { PRODUCTIVITY_PART2 } from "./productivity-part2";
import { DEVELOPER_TOOLS_PART1 } from "./developer-tools-part1";
import { DEVELOPER_TOOLS_PART2 } from "./developer-tools-part2";
import { CRM_MARKETING_SOCIAL_PART1 } from "./crm-marketing-social-part1";
import { CRM_MARKETING_SOCIAL_PART2 } from "./crm-marketing-social-part2";
import { FINANCE_ECOMMERCE_PART1 } from "./finance-ecommerce-part1";
import { FINANCE_ECOMMERCE_PART2 } from "./finance-ecommerce-part2";
import { AI_ML_PART1 } from "./ai-ml-part1";
import { AI_ML_PART2 } from "./ai-ml-part2";

export const INTEGRATION_REGISTRY: Record<string, IntegrationDefinition> = Object.freeze({
  ...PRODUCTIVITY_PART1,
  ...PRODUCTIVITY_PART2,
  ...DEVELOPER_TOOLS_PART1,
  ...DEVELOPER_TOOLS_PART2,
  ...AI_ML_PART1,
  ...AI_ML_PART2,
  ...CRM_MARKETING_SOCIAL_PART1,
  ...CRM_MARKETING_SOCIAL_PART2,
  ...FINANCE_ECOMMERCE_PART1,
  ...FINANCE_ECOMMERCE_PART2,
  ...COMMUNICATION_INTEGRATIONS,
  ...CURATED_REGISTRY,
});

export function getIntegration(id: string): IntegrationDefinition | undefined { return INTEGRATION_REGISTRY[id]; }

export function listIntegrations(opts?: { category?: IntegrationCategory; search?: string }): IntegrationDefinition[] {
  let results = Object.values(INTEGRATION_REGISTRY);
  if (opts?.category) results = results.filter(i => i.category === opts.category);
  if (opts?.search) {
    const q = opts.search.trim().toLowerCase();
    if (q) results = results.filter(i => i.displayName.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || i.tags.some(t => t.toLowerCase().includes(q)));
  }
  return results;
}

export function getCategories(): Array<{ category: IntegrationCategory; count: number }> {
  const counts = new Map<IntegrationCategory, number>();
  for (const item of Object.values(INTEGRATION_REGISTRY)) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  return [...counts.entries()].map(([category,count]) => ({category,count})).sort((a,b)=>b.count-a.count);
}
