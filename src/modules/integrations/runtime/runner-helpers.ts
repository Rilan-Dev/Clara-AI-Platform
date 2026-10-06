import { getIntegration } from "../registry/index.js";
import { credentialVault } from "./credential-vault.js";
import { assertSafeEgressUrl } from "./runner-fetch.js";
import { assertIntegrationExecutionAuthorized } from "./execution-authorization.js";
import type { RunActionParams, OAuth2TokenData } from "./types.js";
import { query } from "@/lib/db";

// ─── Custom Actions ──────────────────────────────────────

interface CustomAction {
  displayName: string;
  description: string;
  props: Record<string, unknown>;
  run: (params: RunActionParams, auth: unknown) => Promise<unknown>;
}

export const customActions: Record<string, Record<string, CustomAction>> = {
  elevenlabs: {
    "elevenlabs-text-to-speech": {
      displayName: "Text to Speech (Free Tier)",
      description: "Convert text to speech using ElevenLabs free tier model (non-streaming, cost-effective). Returns an audio URL.",
      props: {
        text: {
          type: "STRING",
          displayName: "Text",
          description: "The text to convert to speech",
          required: true,
        },
        voice: {
          type: "STRING",
          displayName: "Voice ID",
          description: "Voice ID to use (e.g., EXAVITQu4vr4xnSDxMaL for Sarah)",
          required: true,
        },
      },
      async run(params, auth) {
        const { text, voice } = params.props as { text: string; voice: string };
        if (!text?.trim()) throw new Error("text parameter is required");
        if (!voice?.trim()) throw new Error("voice parameter is required");

        const creds = auth as Record<string, unknown> | undefined;
        const apiKey = creds?.apiKey as string | undefined;
        const region = creds?.region as string | undefined || "default";

        if (!apiKey) throw new Error("ElevenLabs API key is required");

        // Determine base URL based on region
        let baseUrl = "https://api.elevenlabs.io";
        if (region === "us") baseUrl = "https://api.us.elevenlabs.io";
        if (region === "eu") baseUrl = "https://api.eu.elevenlabs.io";

        // Use non-streaming endpoint with free-tier model
        const endpoint = `${baseUrl}/v1/text-to-speech/${voice}`;
        await assertSafeEgressUrl(endpoint);
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: text,
            model_id: "eleven_turbo_v2_5", // Free tier model
            output_format: "mp3_44100_128",
          }),
          redirect: "manual",
        });

        if (response.status >= 300 && response.status < 400) {
          throw new Error("ElevenLabs API redirects are not allowed");
        }

        if (!response.ok) {
          throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`);
        }

        // Get audio data
        const audioBuffer = await response.arrayBuffer();
        
        // Save to local file service
        const { DoableFilesService } = await import("./files-service.js");
        const filesService = new DoableFilesService();
        const filename = `${crypto.randomUUID()}.mp3`;
        const publicUrl = await filesService.write({ 
          fileName: filename, 
          data: Buffer.from(audioBuffer) 
        });

        return publicUrl;
      },
    },
    "elevenlabs-speech-to-text": {
      displayName: "Speech to Text",
      description: "Transcribe audio to text using ElevenLabs Scribe. Returns the transcribed text string.",
      props: {
        audioBase64: {
          type: "STRING",
          displayName: "Audio (Base64)",
          description: "Base64-encoded audio data to transcribe",
          required: true,
        },
        mimeType: {
          type: "STRING",
          displayName: "MIME Type",
          description: "Audio MIME type (e.g., audio/webm, audio/wav, audio/mp4). Defaults to audio/webm.",
          required: false,
        },
        languageCode: {
          type: "STRING",
          displayName: "Language Code",
          description: "BCP-47 language code (e.g., 'en'). Leave empty for auto-detect.",
          required: false,
        },
      },
      async run(params, auth) {
        const { audioBase64, mimeType = "audio/webm", languageCode } = params.props as {
          audioBase64: string;
          mimeType?: string;
          languageCode?: string;
        };

        if (!audioBase64?.trim()) throw new Error("audioBase64 parameter is required");

        const creds = auth as Record<string, unknown> | undefined;
        const apiKey = creds?.apiKey as string | undefined;
        const region = (creds?.region as string | undefined) || "default";

        if (!apiKey) throw new Error("ElevenLabs API key is required");

        // Determine base URL based on region
        let baseUrl = "https://api.elevenlabs.io";
        if (region === "us") baseUrl = "https://api.us.elevenlabs.io";
        if (region === "eu") baseUrl = "https://api.eu.elevenlabs.io";

        // Decode base64 → Buffer → Blob (avoids stream issue with native fetch)
        const audioBuffer = Buffer.from(audioBase64, "base64");
        const cleanMimeType = mimeType.split(";")[0]!; // strip codec params e.g. audio/webm;codecs=opus

        const ext = cleanMimeType.includes("wav") ? "wav"
          : cleanMimeType.includes("ogg") ? "ogg"
          : cleanMimeType.includes("mp4") ? "mp4"
          : "webm";

        // Use native FormData + Blob — works cleanly with Node 22 native fetch
        const blob = new Blob([audioBuffer], { type: cleanMimeType });
        const formData = new FormData();
        formData.append("file", blob, `recording.${ext}`);
        formData.append("model_id", "scribe_v1");
        console.log(
          `[elevenlabs-stt] audioBytes=${audioBuffer.length} mimeType=${cleanMimeType} ext=${ext} language=${languageCode ?? "auto"}`,
        );
        // Suppress non-speech audio-event tags. Scribe defaults to emitting
        // bracketed markers like `[music]`, `[laughter]`, `[outro jingle]`,
        // `[silence]` for non-speech regions, and when a short utterance is
        // followed by silence/ambient (the default 6s mic window in
        // doable-sdk voice.listen almost always is), Scribe returns ONLY the
        // event tag — no words. The caller then renders `[outro jingle]` as
        // the "transcript", which looks broken. `tag_audio_events=false`
        // makes Scribe return the transcript text alone (empty string when
        // no speech was heard), which is the shape voice.listen expects and
        // falls back cleanly on. Also request diarize=false so single-speaker
        // clips aren't wrapped in per-turn metadata.
        formData.append("tag_audio_events", "false");
        formData.append("diarize", "false");
        if (languageCode) formData.append("language_code", languageCode);

        const endpoint = `${baseUrl}/v1/speech-to-text`;
        await assertSafeEgressUrl(endpoint);
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            // Do NOT set Content-Type — let fetch set it automatically with correct boundary
          },
          body: formData,
          redirect: "manual",
        });

        if (!response.ok) {
          throw new Error(`ElevenLabs STT error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as Record<string, unknown>;
        let text = (data.text ?? data.transcript ?? "") as string;

        // Defence in depth: if a build of Scribe ever ignores tag_audio_events
        // (or a future model surfaces stray tags in `text`), strip any leading
        // `[…]` markers so they never leak into the UI as fake transcription.
        // Only strips WHOLE bracketed spans — a legitimate phrase like "hello
        // [world] there" is preserved character-for-character in normal use
        // (Scribe emits only tag OR words, never mixed inline).
        text = text.replace(/\[[^\]]*\]/g, "").trim();

        // Fallback: some Scribe responses return `text: ""` even when the
        // per-word `words` array carries real transcribed content. Rebuild the
        // transcript from `words[].text` when the top-level text is empty. Only
        // include entries typed as spoken words (`type: "word"` or unset — the
        // spacing entries are typed `spacing` and audio-event entries are
        // `audio_event`, both to be skipped). Preserves the punctuation/spacing
        // the words array itself encodes.
        if (!text && Array.isArray(data.words)) {
          const words = data.words as Array<{ text?: string; type?: string }>;
          const rebuilt = words
            .filter((w) => (w?.type ?? "word") === "word" || (w?.type === "spacing"))
            .map((w) => (typeof w.text === "string" ? w.text : ""))
            .join("")
            .replace(/\[[^\]]*\]/g, "")
            .trim();
          if (rebuilt) text = rebuilt;
        }

        const wordsArr = Array.isArray(data.words) ? (data.words as Array<Record<string, unknown>>) : [];
        console.log(
          `[elevenlabs-stt] scribe response: text.length=${text.length} durationSecs=${data.audio_duration_secs ?? "?"} langProb=${data.language_probability ?? "?"} language=${(data.language_code as string) ?? "?"} wordCount=${wordsArr.length}`,
        );

        return text;
      },
    },
  },
  supabase: {
    execute_sql: {
      displayName: "Execute SQL",
      description:
        "Execute raw SQL against the Supabase database (CREATE TABLE, ALTER, INSERT, SELECT, etc.). Uses the Supabase Management API via OAuth when available, or falls back to the PostgREST rpc endpoint.",
      props: {
        sql: {
          type: "STRING",
          displayName: "SQL Query",
          description: "The SQL statement to execute",
          required: true,
        },
      },
      async run(params, auth) {
        const sqlQuery = params.props.sql as string;
        if (!sqlQuery?.trim()) throw new Error("sql parameter is required");

        const creds = auth as Record<string, unknown> | undefined;
        const projectUrl = creds?.url as string | undefined;

        // Strategy 1: Use Management API only when an active, tenant-scoped
        // Management connection exists. This preserves the documented fallback:
        // a Supabase service-role connection must not require an unrelated
        // supabase-mgmt grant merely because the optional OAuth path is absent.
        let mgmtConn = null;
        if (await credentialVault.hasActiveConnection(
          params.userId,
          "supabase-mgmt",
          params.workspaceId,
          params.agentId,
        )) {
          // The Management API credential is a second integration capability.
          // Re-authorize that integration before reading its credential so the
          // supabase action cannot bypass supabase-mgmt platform/plan/grant scope.
          await assertIntegrationExecutionAuthorized({
            integrationId: "supabase-mgmt",
            workspaceId: params.workspaceId,
            agentId: params.agentId,
          });
          mgmtConn = await credentialVault.get(
            params.userId,
            "supabase-mgmt",
            params.workspaceId,
            params.agentId,
          );
        }
        const mgmtToken =
          (mgmtConn?.credentials as Record<string, unknown>)?.access_token as string | undefined ??
          (mgmtConn?.credentials as Record<string, unknown>)?.accessToken as string | undefined;

        if (mgmtToken && projectUrl) {
          const refMatch = projectUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
          if (!refMatch) throw new Error(`Cannot extract project ref from URL: ${projectUrl}`);
          const projectRef = refMatch[1];

          const managementEndpoint = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
          await assertSafeEgressUrl(managementEndpoint);
          const res = await fetch(managementEndpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${mgmtToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ query: sqlQuery }),
            // Never follow a credential-bearing redirect implicitly. A future
            // host-owned transport may follow a validated provider redirect,
            // but this custom action fails closed at the first 3xx response.
            redirect: "manual",
          });

          if (res.status >= 300 && res.status < 400) {
            throw new Error("Supabase Management API redirects are not allowed");
          }

          if (!res.ok) {
            // Never surface provider response bodies from this credential-bearing
            // Management API path. A provider error body is untrusted and may
            // echo the bearer token or other sensitive request material; the
            // outer runner cannot know this secondary credential value because
            // it is resolved inside this custom action.
            throw new Error(`Supabase SQL execution failed (${res.status})`);
          }

          return await res.json();
        }

        // Strategy 2: No OAuth token — try the service role key with PostgREST rpc
        const apiKey = creds?.apiKey as string | undefined;
        if (!projectUrl || !apiKey) {
          throw new Error(
            "Supabase credentials missing. Please connect your Supabase account first.",
          );
        }

        const rpcEndpoint = new URL("/rest/v1/rpc/exec_sql", projectUrl).toString();
        await assertSafeEgressUrl(rpcEndpoint);
        const rpcRes = await fetch(rpcEndpoint, {
          method: "POST",
          headers: {
            apikey: apiKey,
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({ query: sqlQuery }),
          redirect: "manual",
        });

        if (rpcRes.ok) {
          return await rpcRes.json();
        }

        throw new Error(
          "Raw SQL execution requires Supabase OAuth (Sign in with Supabase) so we can use the Management API. " +
          "Alternatively, create a Postgres function named `exec_sql(query text)` in your Supabase project to enable SQL via the service role key. " +
          `PostgREST rpc/exec_sql returned: ${rpcRes.status}`,
        );
      },
    },
  },
};

// ─── Piece Cache ─────────────────────────────────────────

export interface IntegrationPiece {
  displayName?: string;
  actions?: unknown[] | Record<string, unknown> | (() => unknown);
  getAction?: (name: string) => unknown;
}

/** Cache loaded pieces to avoid repeated dynamic imports */
export const pieceCache = new Map<string, IntegrationPiece>();

/**
 * Load a piece package by integration ID.
 */
export async function loadPiece(integrationId: string): Promise<IntegrationPiece> {
  if (pieceCache.has(integrationId)) return pieceCache.get(integrationId)!;

  const def = getIntegration(integrationId);
  if (!def) throw new Error(`Unknown integration: ${integrationId}`);

  try {
    const mod = await import(def.piecePackage);
    let piece = mod.default;
    if (!piece?.displayName) {
      for (const key of Object.keys(mod)) {
        const val = mod[key];
        if (val && typeof val === "object" && val.displayName && (typeof val.actions === "function" || Array.isArray(val.actions) || typeof val.getAction === "function")) {
          piece = val;
          break;
        }
      }
    }

    if (!piece) {
      throw new Error(`No piece export found in ${def.piecePackage}`);
    }

    const typedPiece = piece as IntegrationPiece;
    pieceCache.set(integrationId, typedPiece);
    return typedPiece;
  } catch (err) {
    throw new Error(
      `Failed to load piece ${def.piecePackage}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ─── Auth Resolution ─────────────────────────────────────

export function resolveAuth(authType: string, credentials: unknown): unknown {
  switch (authType) {
    case "oauth2": {
      const creds = credentials as OAuth2TokenData;
      return { access_token: creds.access_token, ...(creds.data ?? {}) };
    }
    case "secret_text": {
      // Activepieces pieces always access auth.secret_text, so we must
      // return { secret_text: "the_value" } regardless of how the
      // credential was stored (apiKey, token, auth, or raw string).
      let rawValue: string | undefined;
      if (typeof credentials === "string") {
        rawValue = credentials;
      } else {
        const credentialRecord = credentials as Record<string, unknown>;
        const candidates = ["secret_text", "apiKey", "token", "auth"];
        for (const key of candidates) {
          const value = credentialRecord[key];
          if (typeof value === "string") {
            rawValue = value;
            break;
          }
        }
      }
      if (rawValue !== undefined) {
        return { secret_text: rawValue };
      }
      return credentials;
    }
    case "custom_auth":
      return { ...(credentials as Record<string, unknown>), props: credentials };
    case "basic_auth":
      return credentials;
    case "none":
      return undefined;
    default:
      return credentials;
  }
}

// ─── Token Refresh Check ─────────────────────────────────

export async function ensureTokenFresh(connectionId: string, orgId: string, authType: string, expectedTokenUrl?: string): Promise<void> {
  if (authType !== "oauth2") return;

  const creds = await credentialVault.decrypt(connectionId, orgId) as OAuth2TokenData | null;
  if (!creds) return;

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = (creds.claimed_at ?? 0) + (creds.expires_in ?? 3600);

  // Refresh slightly before expiry so an action never starts with a token that
  // can expire while the provider request is in flight.
  if (now + 900 < expiresAt) return;

  // An expired OAuth connection without a refresh token cannot be repaired
  // safely by the runner. Never execute a provider action with a known-expired
  // access token; mark the tenant-scoped connection unusable and fail closed.
  if (!creds.refresh_token) {
    await credentialVault.updateStatus(connectionId, orgId, "expired");
    throw new Error("OAuth connection expired and cannot be refreshed");
  }

  if (!expectedTokenUrl || creds.token_url !== expectedTokenUrl) {
    throw new Error("OAuth connection token endpoint does not match the integration registry");
  }

  const tokenUrl = new URL(expectedTokenUrl);
  if (tokenUrl.protocol !== "https:") {
    throw new Error("OAuth token endpoint must use HTTPS");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: creds.refresh_token,
    client_id: creds.client_id,
    client_secret: creds.client_secret,
  });

  // OAuth refresh runs before the action fetch context is established, so enforce
  // the same host-owned egress policy explicitly at the token endpoint.
  await assertSafeEgressUrl(tokenUrl.toString());

  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      // Do not let an OAuth token endpoint redirect the credential-bearing
      // refresh request to an unchecked destination.
      redirect: "manual",
    });
  } catch {
    throw new Error("OAuth token refresh request failed");
  }

  if (!response.ok) {
    const invalidGrant = response.status === 400 || response.status === 401;
    if (invalidGrant) {
      await credentialVault.updateStatus(connectionId, orgId, "expired");
    }
    throw new Error(`OAuth token refresh failed (${response.status})`);
  }

  const refreshed = await response.json() as Record<string, unknown>;
  const accessToken = typeof refreshed.access_token === "string" ? refreshed.access_token : "";
  if (!accessToken) {
    throw new Error("OAuth token refresh returned no access token");
  }

  const expiresIn = typeof refreshed.expires_in === "number" && Number.isFinite(refreshed.expires_in)
    ? refreshed.expires_in
    : 3600;
  const refreshToken = typeof refreshed.refresh_token === "string" && refreshed.refresh_token
    ? refreshed.refresh_token
    : creds.refresh_token;

  await credentialVault.updateCredentials(connectionId, orgId, {
    ...creds,
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
    claimed_at: now,
    data: {
      ...creds.data,
      ...refreshed,
    },
  });
}

// ─── Usage Logging ───────────────────────────────────────

export async function logUsage(params: {
  orgId: string;
  agentId?: string;
  userId: string;
  integrationId: string;
  actionName: string;
  success: boolean;
  durationMs: number;
  errorMessage?: string;
}): Promise<void> {
  try {
    await query`
      INSERT INTO integration_usage_log (
        org_id, agent_id, user_id, integration_id, action_name,
        success, duration_ms, error_message
      ) VALUES (
        ${params.orgId}, ${params.agentId ?? null}, ${params.userId},
        ${params.integrationId}, ${params.actionName}, ${params.success},
        ${params.durationMs}, ${params.errorMessage ?? null}
      )
    `;
  } catch (err) {
    console.warn("[IntegrationRunner] Usage logging failed:", err);
  }
}