import type { AuthType, CustomAuthField } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Server-side validation for organisation connection writes. UI validation is
 * only a usability aid; invalid credentials must never create an active row.
 */
export function validateConnectionCredentials(
  authType: AuthType,
  credentials: unknown,
  fields: readonly CustomAuthField[] = [],
): string | null {
  if (authType === "none") {
    return "This integration does not accept connection credentials.";
  }

  if (authType === "oauth2") {
    if (!isRecord(credentials) || !nonEmptyString(credentials.access_token)) {
      return "OAuth connections require a valid access token. Use the provider consent flow or supply a supported access token.";
    }
    return null;
  }

  if (authType === "secret_text") {
    if (nonEmptyString(credentials)) return null;
    if (!isRecord(credentials)) return "A non-empty API key or access token is required.";
    const valid = ["secret_text", "api_key", "apiKey", "token", "auth"]
      .some((key) => nonEmptyString(credentials[key]));
    return valid ? null : "A non-empty API key or access token is required.";
  }

  if (authType === "basic_auth") {
    if (!isRecord(credentials) ||
        !nonEmptyString(credentials.username) ||
        !nonEmptyString(credentials.password)) {
      return "Basic authentication requires both username and password.";
    }
    return null;
  }

  if (!isRecord(credentials)) return "Credentials must be a JSON object.";
  const requiredFields = fields.filter((field) => field.required);
  if (requiredFields.some((field) => !nonEmptyString(credentials[field.name]))) {
    return `Complete the required credential fields: ${requiredFields
      .filter((field) => !nonEmptyString(credentials[field.name]))
      .map((field) => field.displayName)
      .join(", ")}.`;
  }
  if (Object.values(credentials).some(nonEmptyString)) return null;
  return "At least one non-empty credential value is required.";
}
