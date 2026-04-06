const BLOCKED_HOSTS = [
  "google-analytics.com",
  "overbridgenet.com",
  "googletagmanager.com",
] as const;

const BLOCKED_PATH_FRAGMENTS = [
  "/mp/collect",
  "/jsv8/offer",
] as const;

export const BLOCKED_ANALYTICS_TOKENS = [
  ...BLOCKED_HOSTS,
  ...BLOCKED_PATH_FRAGMENTS,
];

export function findBlockedAnalyticsTokens(input: string): string[] {
  const matches = new Set<string>();
  for (const token of BLOCKED_ANALYTICS_TOKENS) {
    if (input.includes(token)) matches.add(token);
  }
  return [...matches];
}
