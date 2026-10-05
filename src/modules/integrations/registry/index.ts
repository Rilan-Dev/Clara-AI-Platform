import type { IntegrationDefinition, IntegrationCategory } from "../types";
import { COMMUNICATION_INTEGRATIONS } from "./communication";

export const INTEGRATION_REGISTRY: Record<string, IntegrationDefinition> = Object.freeze({
  ...COMMUNICATION_INTEGRATIONS,
});

export function getIntegration(id: string): IntegrationDefinition | undefined {
  return INTEGRATION_REGISTRY[id];
}

export function listIntegrations(opts?: { category?: IntegrationCategory; search?: string }): IntegrationDefinition[] {
  let results = Object.values(INTEGRATION_REGISTRY);
  if (opts?.category) results = results.filter((i) => i.category === opts.category);
  if (opts?.search) {
    const q = opts.search.trim().toLowerCase();
    if (q) results = results.filter((i) => i.displayName.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || i.tags.some((t) => t.toLowerCase().includes(q)));
  }
  return results;
}

export function getCategories(): Array<{ category: IntegrationCategory; count: number }> {
  const counts = new Map<IntegrationCategory, number>();
  for (const item of Object.values(INTEGRATION_REGISTRY)) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  return [...counts.entries()].map(([category,count]) => ({category,count})).sort((a,b)=>b.count-a.count);
}
