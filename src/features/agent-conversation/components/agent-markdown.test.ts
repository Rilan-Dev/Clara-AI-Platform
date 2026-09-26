import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const agentMarkdownSource = readFileSync(
  resolve(__dirname, "agent-markdown.tsx"),
  "utf8",
);

const chatWindowSource = readFileSync(
  resolve(__dirname, "conversation-chat-window.tsx"),
  "utf8",
);

describe("AgentMarkdown (assistant markdown rendering)", () => {
  it("parses GitHub-flavoured Markdown so tables, task lists and strikethrough work", () => {
    // The owner's requirement: AI-generated answers must be formatted, and
    // generated tables must render as real tables (GFM pipe tables).
    expect(agentMarkdownSource).toMatch(/from "react-markdown"/);
    expect(agentMarkdownSource).toMatch(/from "remark-gfm"/);
    expect(agentMarkdownSource).toMatch(/remarkPlugins=\{\[remarkGfm\]\}/);
  });

  it("renders tables inside a horizontally scrollable bordered wrapper", () => {
    expect(agentMarkdownSource).toMatch(/table: \(props\) =>/);
    expect(agentMarkdownSource).toMatch(/overflow-x-auto rounded-xl border border-border\/60/);
    expect(agentMarkdownSource).toMatch(/border-collapse/);
    expect(agentMarkdownSource).toMatch(/whitespace-nowrap/);
  });

  it("strips the react-markdown hast node prop before it reaches the DOM", () => {
    // react-markdown hands every custom component a `node` prop; leaking it
    // onto DOM elements triggers React unknown-prop warnings.
    expect(agentMarkdownSource).toMatch(/function domProps/);
    expect(agentMarkdownSource).toMatch(/delete rest\.node/);
  });

  it("gives fenced code blocks a language chip and a copy affordance", () => {
    expect(agentMarkdownSource).toContain('aria-label={copied ? "Code copied" : "Copy code"}');
    expect(agentMarkdownSource).toMatch(/navigator\.clipboard\.writeText/);
    expect(agentMarkdownSource).toMatch(/CODE_LANGUAGE_LABELS/);
  });

  it("styles inline code distinctly from block code", () => {
    expect(agentMarkdownSource).toMatch(
      /rounded-md border border-border\/50 bg-muted\/70 px-1\.5 py-0\.5 font-mono/,
    );
  });

  it("opens links safely in a new tab", () => {
    expect(agentMarkdownSource).toMatch(/target="_blank"/);
    expect(agentMarkdownSource).toMatch(/rel="noopener noreferrer"/);
  });

  it("shows the streaming caret only while streaming is requested", () => {
    expect(agentMarkdownSource).toContain("const STREAMING_CURSOR");
    expect(agentMarkdownSource).toMatch(
      /\[&>\*:last-child\]:after:content-\[''\]/,
    );
    expect(agentMarkdownSource).toMatch(/streaming && STREAMING_CURSOR/);
  });

  it("is memoised so completed messages are not re-parsed per token", () => {
    expect(agentMarkdownSource).toMatch(/React\.memo\(function AgentMarkdown/);
  });

  it("is provider-neutral — pure presentation, no transport/API imports", () => {
    expect(agentMarkdownSource).not.toMatch(/from\s+"(@\/modules\/(ai-core|voice-core)|\.\.\/lib\/chat-stream|\.\.\/hooks\/use-agent-conversation)/);
    expect(agentMarkdownSource).not.toMatch(/fetch\(|EventSource|WebSocket/);
  });
});

describe("ConversationChatWindow message formatting + single status box", () => {
  it("renders assistant replies through AgentMarkdown, not raw text", () => {
    expect(chatWindowSource).toMatch(
      /import \{ AgentMarkdown \} from "\.\/agent-markdown"/,
    );
    expect(chatWindowSource).toMatch(
      /<AgentMarkdown content=\{message\.content\} streaming=\{streamingAssistant\} \/>/,
    );
    // No assistant bubble may fall back to pre-wrapped raw text anymore.
    expect(chatWindowSource).not.toMatch(
      /<span className="whitespace-pre-wrap break-words">\{message\.content\}<\/span>/,
    );
  });

  it("renders the welcome message through AgentMarkdown as well", () => {
    expect(chatWindowSource).toMatch(
      /<AgentMarkdown content=\{welcomeMessage\} \/>/,
    );
  });

  it("keeps user messages as plain pre-wrapped text", () => {
    // Users type prose, not markdown — their bubble stays literal.
    expect(chatWindowSource).toMatch(
      /<span className="whitespace-pre-wrap">\{message\.content\}<\/span>/,
    );
  });

  it("derives streaming strictly from thinking + an in-flight assistant turn", () => {
    // Previously `thinking || lastMessage?.role === "assistant"` kept the
    // caret pulsing forever after an answer completed.
    expect(chatWindowSource).toMatch(
      /const streaming = thinking && lastMessage\?\.role === "assistant";/,
    );
    expect(chatWindowSource).not.toMatch(
      /const streaming = thinking \|\| lastMessage\?\.role === "assistant";/,
    );
  });

  it("never stacks two status boxes while an answer is being generated", () => {
    // The old behaviour rendered BOTH the empty assistant placeholder bubble
    // AND the separate ThinkingRow — the "2 boxes" the owner reported.
    // Now: the ThinkingRow is suppressed whenever the assistant placeholder
    // bubble exists (chat branch and voice rail alike)…
    expect(chatWindowSource).toMatch(
      /\{thinking && !awaitingAssistantBubble && <ThinkingRow/,
    );
    expect(chatWindowSource).toMatch(
      /\{thinking && !\(lastMessage\?\.role === "assistant"\) && <ThinkingRow/,
    );
    // …and the placeholder bubble itself carries the thinking dots until
    // the first token arrives.
    expect(chatWindowSource).toMatch(
      /streamingAssistant && !message\.content\.trim\(\) \?/,
    );
    expect(chatWindowSource).toMatch(/aria-label="Assistant is composing a reply"/);
    // Exactly one ThinkingRow render site per branch, both gated.
    const thinkingRowSites = chatWindowSource.match(/<ThinkingRow/g) ?? [];
    expect(thinkingRowSites.length).toBe(2);
    const gatedSites = chatWindowSource.match(/\{thinking &&[^\n]*<ThinkingRow/g) ?? [];
    expect(gatedSites.length).toBe(2);
  });
});
