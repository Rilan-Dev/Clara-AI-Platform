export const AUTH_LOGIN_ENDPOINT = "/api/auth/login";

/**
 * Only allow application-local redirects after authentication.
 * This prevents an arbitrary `redirect=` URL from turning login into an
 * open redirect while preserving nested dashboard URLs and query strings.
 */
export function getSafeRedirect(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }
  return value;
}
