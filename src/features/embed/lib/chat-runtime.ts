export type EmbedChatEvent = {
  type: string;
  payload?: unknown;
};

export function parseEmbedChatEvent(line: string): EmbedChatEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const value = JSON.parse(trimmed) as unknown;
    if (!value || typeof value !== "object") return null;
    const event = value as Record<string, unknown>;
    if (typeof event.type !== "string") return null;
    return { type: event.type, payload: event.payload };
  } catch {
    return null;
  }
}

export async function readEmbedError(response: Response): Promise<string> {
  const fallback = `Assistant request failed (${response.status})`;
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  try {
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as Record<string, unknown>;
      if (typeof body.error === "string" && body.error.trim()) return body.error.trim();
      if (typeof body.message === "string" && body.message.trim()) return body.message.trim();
    } else {
      const text = (await response.text()).trim();
      if (text) {
        try {
          const body = JSON.parse(text) as Record<string, unknown>;
          if (typeof body.error === "string" && body.error.trim()) return body.error.trim();
          if (typeof body.message === "string" && body.message.trim()) return body.message.trim();
        } catch {
          return text.slice(0, 500);
        }
      }
    }
  } catch {
    // Keep the stable fallback when the error response itself cannot be parsed.
  }

  return fallback;
}
