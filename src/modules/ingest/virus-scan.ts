/**
 * src/modules/ingest/virus-scan.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 6.1 file-upload virus scan hook.
 *
 * Pluggable scanner integration for uploaded documents. The platform does
 * not bundle an AV engine; instead it exposes this hook so operators can
 * front it with any HTTP virus-scanning microservice (ClamAV + clamd-rest,
 * Scanii, VirusTotal API tunnel, a private Lambda, …).
 *
 * Configuration:
 *   VIRUS_SCAN_URL      — base URL of the scanner service. When unset (the
 *                         default) the hook is a no-op pass-through, which
 *                         keeps local/dev/demo deployments dependency-free.
 *   VIRUS_SCAN_API_KEY  — optional bearer token sent to the scanner.
 *   VIRUS_SCAN_TIMEOUT_MS — request timeout, default 15s.
 *
 * Contract (POST {VIRUS_SCAN_URL}/scan):
 *   Request:  raw file bytes as application/octet-stream,
 *             ?filename=<name> query parameter
 *   Response: 200 { clean: boolean, signature?: string }
 *
 * Failure semantics are FAIL-CLOSED: if the scanner is configured but
 * unreachable or returns an unexpected body, the upload is rejected with
 * VIRUS_SCAN_UNAVAILABLE rather than silently admitting an unscanned file.
 */

const DEFAULT_TIMEOUT_MS = 15_000;

export interface VirusScanResult {
  clean: boolean;
  /** Scanner engine that produced the verdict ("disabled" when hook is off). */
  scanner: string;
  /** Malware signature reported by the scanner, when infected. */
  signature?: string;
}

export function isVirusScanEnabled(): boolean {
  return Boolean(process.env.VIRUS_SCAN_URL);
}

export async function scanUpload(buffer: Buffer, filename: string): Promise<VirusScanResult> {
  const url = process.env.VIRUS_SCAN_URL;
  if (!url) {
    // Hook disabled — documented pass-through (see Phase 6.1 "virus scan hook").
    return { clean: true, scanner: "disabled" };
  }

  const timeoutMs = Number(process.env.VIRUS_SCAN_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const endpoint = `${url.replace(/\/$/, "")}/scan?filename=${encodeURIComponent(filename)}`;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        ...(process.env.VIRUS_SCAN_API_KEY
          ? { Authorization: `Bearer ${process.env.VIRUS_SCAN_API_KEY}` }
          : {}),
      },
      body: new Uint8Array(buffer),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    console.error("[virus-scan] scanner unreachable:", (err as Error).message);
    throw new VirusScanUnavailableError("Virus scanner is configured but unreachable.");
  }

  if (!res.ok) {
    console.error("[virus-scan] scanner returned HTTP", res.status);
    throw new VirusScanUnavailableError(`Virus scanner returned HTTP ${res.status}.`);
  }

  let body: { clean?: boolean; signature?: string };
  try {
    body = (await res.json()) as { clean?: boolean; signature?: string };
  } catch {
    throw new VirusScanUnavailableError("Virus scanner returned a malformed response.");
  }

  if (typeof body.clean !== "boolean") {
    throw new VirusScanUnavailableError("Virus scanner response missing the 'clean' boolean.");
  }

  return {
    clean: body.clean,
    scanner: process.env.VIRUS_SCAN_URL ?? "remote",
    signature: body.signature,
  };
}

export class VirusScanUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VirusScanUnavailableError";
  }
}
