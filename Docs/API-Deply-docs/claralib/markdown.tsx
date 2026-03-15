/**
 * src/lib/clara/markdown.tsx
 * Lightweight markdown renderer for Clara chat & voice responses.
 * No external dependency — handles the patterns the AI actually produces.
 *
 * Supported:
 *   **bold**  *italic*  `code`
 *   # H1  ## H2  ### H3
 *   - bullet list  1. numbered list
 *   [S1] [S2] citation badges
 *   Paragraphs (blank line) and line breaks
 */
import React from "react";

// ── Inline renderer ───────────────────────────────────────────────────────────
// Handles: **bold**, *italic*, `code`, [S1] citation badges

function renderInline(text: string, isUser: boolean): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Combined regex: **bold**, *italic*, `code`, [Sn] citations
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[S(\d+)\]/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));

    if (match[1] !== undefined) {
      // **bold**
      parts.push(<strong key={match.index} style={{ fontWeight: 700 }}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      // *italic*
      parts.push(<em key={match.index}>{match[2]}</em>);
    } else if (match[3] !== undefined) {
      // `code`
      parts.push(
        <code key={match.index} style={{
          fontFamily: "monospace",
          fontSize: "0.88em",
          background: isUser ? "rgba(255,255,255,0.2)" : "rgba(59,109,232,0.08)",
          borderRadius: 4,
          padding: "1px 5px",
          color: isUser ? "#fff" : "hsl(221 83% 45%)",
        }}>{match[3]}</code>
      );
    } else if (match[4] !== undefined) {
      // [S1] citation badge
      parts.push(
        <span key={match.index} style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.72em",
          fontWeight: 700,
          lineHeight: 1,
          padding: "1px 5px",
          borderRadius: 10,
          background: isUser ? "rgba(255,255,255,0.25)" : "rgba(59,109,232,0.12)",
          color: isUser ? "#fff" : "hsl(221 83% 50%)",
          verticalAlign: "middle",
          margin: "0 1px",
          letterSpacing: "0.01em",
        }}>S{match[4]}</span>
      );
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// ── Block parser ──────────────────────────────────────────────────────────────
// Parses lines into block types then renders each block

type Block =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullet"; items: string[] }
  | { type: "numbered"; items: string[] }
  | { type: "hr" };

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Skip empty lines (paragraph separator)
    if (!trimmed) { i++; continue; }

    // Headings
    if (/^###\s+/.test(trimmed)) {
      blocks.push({ type: "h3", text: trimmed.replace(/^###\s+/, "") });
      i++; continue;
    }
    if (/^##\s+/.test(trimmed)) {
      blocks.push({ type: "h2", text: trimmed.replace(/^##\s+/, "") });
      i++; continue;
    }
    if (/^#\s+/.test(trimmed)) {
      blocks.push({ type: "h1", text: trimmed.replace(/^#\s+/, "") });
      i++; continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      i++; continue;
    }

    // Bullet list — collect consecutive bullet lines
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i]!.trim())) {
        items.push(lines[i]!.trim().replace(/^[-*•]\s+/, ""));
        i++;
      }
      blocks.push({ type: "bullet", items });
      continue;
    }

    // Numbered list — collect consecutive numbered lines
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i]!.trim())) {
        items.push(lines[i]!.trim().replace(/^\d+[.)]\s+/, ""));
        i++;
      }
      blocks.push({ type: "numbered", items });
      continue;
    }

    // Paragraph — collect lines until empty line or block-start
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^(#{1,3}\s|[-*•]\s|\d+[.)]\s|-{3,}|\*{3,}|_{3,})/.test(lines[i]!.trim())
    ) {
      paraLines.push(lines[i]!);
      i++;
    }
    if (paraLines.length) {
      blocks.push({ type: "paragraph", text: paraLines.join("\n") });
    }
  }

  return blocks;
}

// ── Main component ────────────────────────────────────────────────────────────

export function MarkdownMessage({
  content,
  isUser = false,
}: {
  content: string;
  isUser?: boolean;
}) {
  const blocks = parseBlocks(content);

  const textColor = isUser ? "#fff" : "#1e293b";
  const mutedColor = isUser ? "rgba(255,255,255,0.75)" : "#64748b";
  const accentColor = isUser ? "rgba(255,255,255,0.4)" : "rgba(59,109,232,0.15)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, color: textColor }}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case "h1":
            return (
              <p key={idx} style={{ margin: 0, fontWeight: 800, fontSize: "1.05em", lineHeight: 1.3 }}>
                {renderInline(block.text, isUser)}
              </p>
            );
          case "h2":
            return (
              <p key={idx} style={{ margin: 0, fontWeight: 700, fontSize: "0.97em", lineHeight: 1.35 }}>
                {renderInline(block.text, isUser)}
              </p>
            );
          case "h3":
            return (
              <p key={idx} style={{ margin: 0, fontWeight: 600, fontSize: "0.93em", lineHeight: 1.35, color: isUser ? "rgba(255,255,255,0.9)" : "hsl(221 83% 45%)" }}>
                {renderInline(block.text, isUser)}
              </p>
            );
          case "hr":
            return <hr key={idx} style={{ border: "none", borderTop: `1px solid ${accentColor}`, margin: "2px 0" }} />;
          case "bullet":
            return (
              <ul key={idx} style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2 }}>
                {block.items.map((item, j) => (
                  <li key={j} style={{ lineHeight: 1.5, fontSize: "0.95em" }}>
                    {renderInline(item, isUser)}
                  </li>
                ))}
              </ul>
            );
          case "numbered":
            return (
              <ol key={idx} style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 2 }}>
                {block.items.map((item, j) => (
                  <li key={j} style={{ lineHeight: 1.5, fontSize: "0.95em" }}>
                    {renderInline(item, isUser)}
                  </li>
                ))}
              </ol>
            );
          case "paragraph": {
            // Preserve intentional single newlines as <br> within paragraphs
            const sublines = block.text.split("\n");
            return (
              <p key={idx} style={{ margin: 0, lineHeight: 1.6 }}>
                {sublines.map((subline, j) => (
                  <React.Fragment key={j}>
                    {renderInline(subline, isUser)}
                    {j < sublines.length - 1 && <br />}
                  </React.Fragment>
                ))}
              </p>
            );
          }
          default:
            return null;
        }
      })}
    </div>
  );
}

// ── Voice transcript variant (simpler — no heavy headings) ────────────────────
// Voice responses are shorter so this uses tighter spacing

export function MarkdownVoice({
  text,
  isUser = false,
}: {
  text: string;
  isUser?: boolean;
}) {
  // For voice, just render inline markdown on each line — no heavy block parsing
  const lines = text.split("\n");
  return (
    <span style={{ display: "inline" }}>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {renderInline(line, isUser)}
          {i < lines.length - 1 && <br />}
        </React.Fragment>
      ))}
    </span>
  );
}
