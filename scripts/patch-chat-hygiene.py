#!/usr/bin/env python3
"""Apply the chat error-hygiene patch with CRLF tolerance."""
import re, sys

PATH = "/home/z/my-project/Clara-AI-Platform/src/modules/assistant/api/chat.ts"
src = open(PATH, encoding="utf-8", newline="").read()

def sub(pattern, repl, count=1, label=""):
    global src
    new, n = re.subn(pattern, repl, src, count=count)
    if n == 0:
        print(f"FAILED: {label}"); sys.exit(1)
    src = new
    print(f"ok: {label} ({n})")

# 1. ChatRetrievalError class before postChatKb
sub(
    r"(?<!\})async function postChatKb\(",
    """/**
 * Retrieval/embedding provider failure inside the chat pipeline.
 *
 * Thrown (typed) so the outer handler can return the friendly 502 instead of
 * leaking raw provider/edge errors (which can reference regions, keys or
 * upstream internals) to workspace users — mirrors the /api/embed/search
 * error-hygiene contract.
 */
class ChatRetrievalError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "ChatRetrievalError";
    this.cause = cause;
  }
}

async function postChatKb(""",
    label="ChatRetrievalError class")

# 2. KB-mode retrieval catch → typed re-throw
sub(
    r"throw searchErr;",
    "throw new ChatRetrievalError(searchErr);",
    label="KB retrieval typed re-throw")

# 3. KB-mode stream error event → friendly payload + raw to server log
sub(
    r'(\s*)write\(\{ type: "error", payload: streamError \}\);',
    r"""\1// Raw provider/edge errors must not reach the client (they can
\1// reference regions, keys or upstream internals) — log them, show a
\1// friendly event. The audit row keeps the error status either way.
\1console.error("[chat] stream failed:", streamError);
\1write({ type: "error", payload: "The assistant could not complete the answer. Please try again in a moment." });""",
    label="KB stream error event")

# 4. Mode-B embedQuery → typed wrap
sub(
    r"const embedding = await embedQuery\(query\);",
    """const embedding = await embedQuery(query).catch((embedErr) => {
      // Provider failure during the Mode-B retrieval — same typed wrap so the
      // outer handler returns the friendly 502 (never the raw provider text).
      throw new ChatRetrievalError(embedErr);
    });""",
    label="Mode-B embedQuery wrap")

# 5. Mode-B stream error event → friendly payload
sub(
    r"""writeEvent\(\{
\s*type: "error",
\s*payload:
\s*error instanceof Error
\s*\? error\.message
\s*: "Streaming error occurred\.",
\s*\}\);""",
    """writeEvent({
              type: "error",
              payload: "The assistant could not complete the answer. Please try again in a moment.",
            });""",
    label="Mode-B stream error event")

# 6. Outer catch → friendly 502 for retrieval failures
sub(
    r"""  \} catch \(error\) \{
    console\.error\("\[chat\] handler error:", error\);
    const message =
      error instanceof Error \? error\.message : "Unexpected server error\.";
    return NextResponse\.json\(\{ error: message \}, \{ status: 400 \}\);
  \}
\}""",
    """  } catch (error) {
    if (error instanceof ChatRetrievalError) {
      // Retrieval/embedding provider failure — friendly 502, raw cause only
      // in the server log (mirrors /api/embed/search error hygiene).
      console.error("[chat] retrieval failed:", error.cause ?? error.message);
      return NextResponse.json(
        { error: "Knowledge-base search failed. Please verify the embedding configuration and try again." },
        { status: 502 },
      );
    }
    console.error("[chat] handler error:", error);
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}""",
    label="outer catch friendly 502")

open(PATH, "w", encoding="utf-8", newline="").write(src)
print("\npatch applied")
