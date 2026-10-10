export const INTEGRATION_OAUTH_CALLBACK_PATH = "/api/integrations/oauth/callback";

export function validateRedirectUri(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "Redirect URI must be an absolute URL.";
  }
  const localHttp = parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]") &&
    process.env.NODE_ENV !== "production";
  if (parsed.protocol !== "https:" && !localHttp) {
    return "Redirect URI must use HTTPS (HTTP is allowed only for local development).";
  }
  if (parsed.username || parsed.password || parsed.hash) {
    return "Redirect URI must not contain credentials or a fragment.";
  }
  if (parsed.search) {
    return "Redirect URI must not contain a query string; use the canonical Clara OAuth callback URI.";
  }
  if (parsed.pathname !== INTEGRATION_OAUTH_CALLBACK_PATH) {
    return `Redirect URI path must be the canonical Clara callback: ${INTEGRATION_OAUTH_CALLBACK_PATH}`;
  }
  if (/your-domain|\.\.\./i.test(parsed.hostname) || /your-domain|\.\.\./i.test(parsed.href)) {
    return "Replace the example placeholder with the actual Clara deployment callback URI.";
  }
  return null;
}

function normalizeScopes(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((scope) => typeof scope === "string")) {
    return null;
  }
  const scopes = value.map((scope: string) => scope.trim()).filter(Boolean);
  if (scopes.length > 100 || scopes.some((scope) => scope.length > 200)) return null;
  return [...new Set(scopes)];
}

