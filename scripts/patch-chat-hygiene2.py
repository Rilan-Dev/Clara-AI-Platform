#!/usr/bin/env python3
"""Apply remaining chat error-hygiene patches (CRLF-tolerant, line-ending preserving)."""
import sys

PATH = "/home/z/my-project/Clara-AI-Platform/src/modules/assistant/api/chat.ts"
src = open(PATH, encoding="utf-8", newline="").read()

# Detect per-region line ending by probing the anchor lines.
def endings(anchor):
    i = src.find(anchor)
    assert i >= 0, f"anchor not found: {anchor!r}"
    j = src.find("\n", i)
    return "\r\n" if j > 0 and src[j-1] == "\r" else "\n"

def replace(old, new, label):
    global src
    n = src.count(old)
    if n != 1:
        print(f"FAILED ({label}): found {n} occurrences"); sys.exit(1)
    src = src.replace(old, new)
    print(f"ok: {label}")

# ── 1. KB-mode retrieval catch → typed re-throw ──────────────────────────────
nl = endings("throw searchErr;")
old = (
    "    throw searchErr;"
)
new = (
    "    throw new ChatRetrievalError(searchErr);"
)
# ensure uniqueness with context
old_ctx = "    void finalizeQueryEvent(eventId, {" + nl + "      answerText: \"\", status: \"error\"," + nl + "      latencyMs: Date.now() - t0," + nl + "    });" + nl + "    throw searchErr;"
new_ctx = "    void finalizeQueryEvent(eventId, {" + nl + "      answerText: \"\", status: \"error\"," + nl + "      latencyMs: Date.now() - t0," + nl + "    });" + nl + "    throw new ChatRetrievalError(searchErr);"
replace(old_ctx, new_ctx, "KB retrieval typed re-throw")

# ── 2. KB-mode stream error event → friendly payload ─────────────────────────
nl = endings('write({ type: "error", payload: streamError });')
old = (
    '        } catch (err) {' + nl +
    '          streamError = (err as Error).message;' + nl +
    '          write({ type: "error", payload: streamError });' + nl
)
new = (
    '        } catch (err) {' + nl +
    '          streamError = (err as Error).message;' + nl +
    '          // Raw provider/edge errors must not reach the client (they can' + nl +
    '          // reference regions, keys or upstream internals) — log them, show a' + nl +
    '          // friendly event. The audit row keeps the error status either way.' + nl +
    '          console.error("[chat] stream failed:", streamError);' + nl +
    '          write({ type: "error", payload: "The assistant could not complete the answer. Please try again in a moment." });' + nl
)
replace(old, new, "KB stream error friendly event")

# ── 3. Mode-B embedQuery wrap ────────────────────────────────────────────────
nl = endings("const embedding = await embedQuery(query);")
old = "    const embedding = await embedQuery(query);" + nl + "    const retrieved = await searchSimilarDocuments("
new = (
    "    const embedding = await embedQuery(query).catch((embedErr) => {" + nl +
    "      // Provider failure during the Mode-B retrieval — same typed wrap so the" + nl +
    "      // outer handler returns the friendly 502 (never the raw provider text)." + nl +
    "      throw new ChatRetrievalError(embedErr);" + nl +
    "    });" + nl +
    "    const retrieved = await searchSimilarDocuments("
)
replace(old, new, "Mode-B embedQuery wrap")

# ── 4. Outer catch → friendly 502 for retrieval failures ─────────────────────
nl = endings('console.error("[chat] handler error:", error);')
old = (
    '  } catch (error) {' + nl +
    '    console.error("[chat] handler error:", error);' + nl +
    '    const message =' + nl +
    '      error instanceof Error ? error.message : "Unexpected server error.";' + nl +
    '    return NextResponse.json({ error: message }, { status: 400 });' + nl +
    '  }' + nl +
    '}'
)
new = (
    '  } catch (error) {' + nl +
    '    if (error instanceof ChatRetrievalError) {' + nl +
    '      // Retrieval/embedding provider failure — friendly 502, raw cause only' + nl +
    '      // in the server log (mirrors /api/embed/search error hygiene).' + nl +
    '      console.error("[chat] retrieval failed:", error.cause ?? error.message);' + nl +
    '      return NextResponse.json(' + nl +
    '        { error: "Knowledge-base search failed. Please verify the embedding configuration and try again." },' + nl +
    '        { status: 502 },' + nl +
    '      );' + nl +
    '    }' + nl +
    '    console.error("[chat] handler error:", error);' + nl +
    '    const message =' + nl +
    '      error instanceof Error ? error.message : "Unexpected server error.";' + nl +
    '    return NextResponse.json({ error: message }, { status: 400 });' + nl +
    '  }' + nl +
    '}'
)
replace(old, new, "outer catch friendly 502")

open(PATH, "w", encoding="utf-8", newline="").write(src)
print("\nall remaining patches applied")
