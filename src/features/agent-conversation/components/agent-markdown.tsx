"use client";

/**
 * Markdown renderer for agent conversation messages.
 *
 * AI answers arrive as GitHub-flavoured Markdown (headings, bold/italic,
 * lists, tables, fenced code, quotes, links). Rendering them as raw text
 * made answers unreadable — this component turns assistant content into
 * properly formatted chat typography.
 *
 * Design constraints:
 * - Works inside the existing chat bubble chrome (text-sm scale, theme
 *   tokens border-border / bg-muted / text-foreground / text-primary) —
 *   no `prose` dependency (the typography plugin is not installed).
 * - Streaming-safe: partial Markdown (an unclosed code fence or table)
 *   still renders; a pulsing cursor rides the end of the last block while
 *   `streaming` is true.
 * - Memoised so completed messages are not re-parsed on every token.
 * - Provider-neutral: pure presentation, no transport/API imports.
 */

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** Friendly labels for the code-block header chip. */
const CODE_LANGUAGE_LABELS: Record<string, string> = {
  js: "JavaScript",
  javascript: "JavaScript",
  jsx: "JSX",
  mjs: "JavaScript",
  cjs: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TSX",
  py: "Python",
  python: "Python",
  sh: "Shell",
  bash: "Shell",
  shell: "Shell",
  zsh: "Shell",
  console: "Shell",
  json: "JSON",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  md: "Markdown",
  markdown: "Markdown",
  html: "HTML",
  xml: "XML",
  css: "CSS",
  scss: "SCSS",
  sql: "SQL",
  java: "Java",
  go: "Go",
  rs: "Rust",
  rust: "Rust",
  php: "PHP",
  rb: "Ruby",
  ruby: "Ruby",
  c: "C",
  cpp: "C++",
  "c++": "C++",
  cs: "C#",
  csharp: "C#",
  kotlin: "Kotlin",
  swift: "Swift",
  dart: "Dart",
  diff: "Diff",
  text: "Text",
  plaintext: "Text",
};

/**
 * react-markdown hands every custom component the hast `node` prop; DOM
 * elements must never receive it. This strips it (delete, not destructuring,
 * so no unused-variable lint noise) and returns a DOM-safe prop bag.
 */
function domProps<T extends object>(props: T & { node?: unknown }): Omit<T, "node"> {
  const rest = { ...props } as T & { node?: unknown };
  delete rest.node;
  return rest as Omit<T, "node">;
}

/** Recursively flatten rendered React children back to raw text (for copy). */
function extractText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement(node)) {
    return extractText((node.props as { children?: React.ReactNode }).children);
  }
  return "";
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = React.useState(false);

  const copy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable (permissions / http) — silently ignore */
    }
  }, [code]);

  const label =
    CODE_LANGUAGE_LABELS[language.toLowerCase()] ??
    (language ? language.toUpperCase() : "Code");

  return (
    <div className="my-2.5 overflow-hidden rounded-xl border border-border/60 bg-muted/25">
      <div className="flex items-center justify-between border-b border-border/50 bg-muted/40 py-1 pl-3 pr-1.5">
        <span className="select-none text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Code copied" : "Copy code"}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted/70 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
      <pre className="overflow-x-auto px-3.5 py-2.5 font-mono text-[12.5px] leading-relaxed text-foreground">
        <code className="whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}

const renderers: Components = {
  h1: (props) => (
    <h1 {...domProps(props)} className={cn("mb-1.5 mt-3 text-[15px] font-semibold tracking-tight text-foreground first:mt-0", props.className)} />
  ),
  h2: (props) => (
    <h2 {...domProps(props)} className={cn("mb-1 mt-3 text-[15px] font-semibold tracking-tight text-foreground first:mt-0", props.className)} />
  ),
  h3: (props) => (
    <h3 {...domProps(props)} className={cn("mb-1 mt-2.5 text-sm font-semibold text-foreground first:mt-0", props.className)} />
  ),
  h4: (props) => (
    <h4 {...domProps(props)} className={cn("mb-0.5 mt-2 text-sm font-semibold text-foreground first:mt-0", props.className)} />
  ),
  h5: (props) => (
    <h5 {...domProps(props)} className={cn("mb-0.5 mt-2 text-sm font-medium text-foreground first:mt-0", props.className)} />
  ),
  h6: (props) => (
    <h6 {...domProps(props)} className={cn("mb-0.5 mt-2 text-sm font-medium text-muted-foreground first:mt-0", props.className)} />
  ),
  p: (props) => (
    <p {...domProps(props)} className={cn("my-1.5 leading-relaxed text-foreground first:mt-0 last:mb-0", props.className)} />
  ),
  strong: (props) => (
    <strong {...domProps(props)} className={cn("font-semibold text-foreground", props.className)} />
  ),
  em: (props) => (
    <em {...domProps(props)} className={cn("italic", props.className)} />
  ),
  del: (props) => (
    <del {...domProps(props)} className={cn("text-muted-foreground", props.className)} />
  ),
  a: (props) => (
    <a
      {...domProps(props)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("font-medium text-primary underline decoration-primary/40 underline-offset-2 transition hover:decoration-primary", props.className)}
    />
  ),
  ul: (props) => (
    <ul {...domProps(props)} className={cn("my-2 list-disc space-y-1 pl-5 marker:text-muted-foreground/70 first:mt-0 last:mb-0", props.className)} />
  ),
  ol: (props) => (
    <ol {...domProps(props)} className={cn("my-2 list-decimal space-y-1 pl-5 marker:font-medium marker:text-muted-foreground/70 first:mt-0 last:mb-0", props.className)} />
  ),
  li: (props) => (
    <li {...domProps(props)} className={cn("leading-relaxed text-foreground", props.className)} />
  ),
  input: (props) => (
    // GFM task-list checkbox
    <input {...domProps(props)} className={cn("mr-1.5 h-3 w-3 translate-y-[1px] accent-primary", props.className)} />
  ),
  blockquote: (props) => (
    <blockquote
      {...domProps(props)}
      className={cn("my-2 rounded-r-lg border-l-2 border-primary/60 bg-primary/[0.06] px-3.5 py-2 text-foreground/80 first:mt-0 last:mb-0", props.className)}
    />
  ),
  hr: (props) => (
    <hr {...domProps(props)} className={cn("my-3 border-border/60", props.className)} />
  ),
  img: (props) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...domProps(props)} alt={props.alt ?? ""} loading="lazy" className={cn("my-2 max-h-80 rounded-xl border border-border/60", props.className)} />
  ),
  table: (props) => (
    <div className="my-2.5 w-full overflow-x-auto rounded-xl border border-border/60 bg-muted/20 first:mt-0 last:mb-0">
      <table {...domProps(props)} className={cn("w-full border-collapse text-left text-[13px]", props.className)} />
    </div>
  ),
  thead: (props) => (
    <thead {...domProps(props)} className={cn("bg-muted/40", props.className)} />
  ),
  tbody: (props) => (
    <tbody {...domProps(props)} className={cn("divide-y divide-border/40", props.className)} />
  ),
  th: (props) => (
    <th
      {...domProps(props)}
      className={cn("whitespace-nowrap border-b border-border/60 bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", props.className)}
    />
  ),
  td: (props) => (
    <td {...domProps(props)} className={cn("px-3 py-2 align-top text-foreground", props.className)} />
  ),
  pre: (props) => {
    // Block code: rebuild from the rendered <code> child so plain fences
    // (no language tag) and fenced+labelled blocks both take the same path.
    const children = props.children;
    const first = Array.isArray(children) ? children[0] : children;
    const codeClassName = React.isValidElement(first)
      ? String((first.props as { className?: string }).className ?? "")
      : "";
    const language = /language-([\w#+-]+)/.exec(codeClassName)?.[1]?.toLowerCase() ?? "";
    const code = extractText(children).replace(/\n$/, "");
    return <CodeBlock language={language} code={code} />;
  },
  code: (props) => {
    if (props.className && /language-/.test(props.className)) {
      // Inside a block — visual chrome is owned by the pre renderer.
      return <code className={props.className}>{props.children}</code>;
    }
    // Inline code chip.
    return (
      <code
        {...domProps(props)}
        className={cn("rounded-md border border-border/50 bg-muted/70 px-1.5 py-0.5 font-mono text-[12px] font-medium text-primary", props.className)}
      />
    );
  },
};

/**
 * Streaming cursor: rides inline at the end of the last rendered block,
 * exactly like the caret of a text editor (ChatGPT-style).
 */
const STREAMING_CURSOR = [
  "[&>*:last-child]:after:content-['']",
  "[&>*:last-child]:after:ml-0.5",
  "[&>*:last-child]:after:inline-block",
  "[&>*:last-child]:after:h-3.5",
  "[&>*:last-child]:after:w-[2px]",
  "[&>*:last-child]:after:translate-y-[3px]",
  "[&>*:last-child]:after:rounded-full",
  "[&>*:last-child]:after:bg-primary",
  "[&>*:last-child]:after:align-baseline",
  "[&>*:last-child]:after:animate-pulse",
  "[&>*:last-child]:after:pointer-events-none",
].join(" ");

export interface AgentMarkdownProps {
  content: string;
  /** True while tokens are still arriving — shows the trailing caret. */
  streaming?: boolean;
  className?: string;
}

export const AgentMarkdown = React.memo(function AgentMarkdown({
  content,
  streaming = false,
  className,
}: AgentMarkdownProps) {
  if (!content.trim()) return null;
  return (
    <div
      className={cn(
        "agent-markdown break-words text-sm leading-relaxed text-foreground",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_li>p]:my-0 [&_li]:leading-relaxed",
        "[&_ul_ol]:mt-1 [&_ol_ul]:mt-1 [&_li>ul]:my-1 [&_li>ol]:my-1",
        streaming && STREAMING_CURSOR,
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={renderers}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
