/**
 * src/modules/ingest/crawlers/robots-parser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight robots.txt parser. Checks whether a given URL path is allowed
 * for our bot user-agent ("ClaraKnowledgeBot").
 */

export type RobotsRules = {
  allowedPaths: string[];
  disallowedPaths: string[];
  sitemaps: string[];
  crawlDelay: number | null;
};

const BOT_USER_AGENT = "claraknowledgebot";

/**
 * Fetches and parses robots.txt for a given origin.
 * Returns null if robots.txt is unavailable (treat as "allow all").
 */
export async function fetchRobotsTxt(origin: string): Promise<RobotsRules | null> {
  try {
    const url = new URL("/robots.txt", origin).toString();
    const res = await fetch(url, {
      headers: { "User-Agent": "ClaraKnowledgeBot/1.0" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;

    const text = await res.text();
    return parseRobotsTxt(text);
  } catch {
    // Network error or timeout — treat as "allow all"
    return null;
  }
}

/**
 * Parses raw robots.txt content into structured rules.
 * Focuses on rules for our bot or the catch-all "*" user-agent.
 */
export function parseRobotsTxt(content: string): RobotsRules {
  const lines = content.split(/\r?\n/);
  const rules: RobotsRules = {
    allowedPaths: [],
    disallowedPaths: [],
    sitemaps: [],
    crawlDelay: null,
  };

  let currentAgent = "";
  let isRelevantAgent = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip comments and empty lines
    if (!line || line.startsWith("#")) continue;

    // Strip inline comments
    const cleanLine = line.split("#")[0]!.trim();
    const colonIdx = cleanLine.indexOf(":");
    if (colonIdx === -1) continue;

    const directive = cleanLine.slice(0, colonIdx).trim().toLowerCase();
    const value = cleanLine.slice(colonIdx + 1).trim();

    if (directive === "user-agent") {
      currentAgent = value.toLowerCase();
      isRelevantAgent =
        currentAgent === "*" || currentAgent === BOT_USER_AGENT;
    } else if (directive === "sitemap") {
      // Sitemaps are global (not agent-specific)
      if (value) rules.sitemaps.push(value);
    } else if (isRelevantAgent) {
      if (directive === "disallow" && value) {
        rules.disallowedPaths.push(value);
      } else if (directive === "allow" && value) {
        rules.allowedPaths.push(value);
      } else if (directive === "crawl-delay") {
        const delay = parseFloat(value);
        if (Number.isFinite(delay) && delay > 0) {
          rules.crawlDelay = delay;
        }
      }
    }
  }

  return rules;
}

/**
 * Checks whether a specific URL path is allowed by the parsed robots rules.
 * Allow rules take precedence over Disallow rules for the same path.
 */
export function isUrlAllowed(urlPath: string, rules: RobotsRules | null): boolean {
  if (!rules) return true; // No robots.txt → allow everything

  // Check Allow rules first (they take precedence)
  for (const allowed of rules.allowedPaths) {
    if (urlPath.startsWith(allowed)) return true;
  }

  // Check Disallow rules
  for (const disallowed of rules.disallowedPaths) {
    if (urlPath.startsWith(disallowed)) return false;
  }

  return true; // Not mentioned → allowed by default
}
