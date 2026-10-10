/**
 * Structural render check for AgentMarkdown — renders real Markdown content
 * to static markup (no browser needed) to confirm:
 *   1. GFM tables become real bordered tables (the owner's core complaint),
 *   2. headings/bold/lists/quotes/links/code all render as HTML elements,
 *   3. block code gets the language chip + copy button, inline code gets the
 *      inline chip,
 *   4. the streaming caret class rides the container only while streaming,
 *   5. partial Markdown (unclosed fence) renders without throwing,
 *   6. empty content renders nothing (placeholder handled by the bubble).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { AgentMarkdown } from "../.worktrees/vc/src/features/agent-conversation/components/agent-markdown";

const rich = [
  "## Comparison",
  "",
  "Clara supports **voice**, *chat* and `tools`.",
  "",
  "| Feature | Voice | Chat |",
  "| --- | :---: | :---: |",
  "| Streaming | yes | yes |",
  "| Markdown | no | **yes** |",
  "",
  "- task one",
  "- [x] done",
  "- [ ] pending",
  "",
  "```python",
  "def greet(name):",
  "    return f\"Hello {name}\"",
  "```",
  "",
  "Plain fence:",
  "",
  "```",
  "no language here",
  "```",
  "",
  "> quoted wisdom",
  "",
  "---",
  "",
  "See [the docs](https://example.com).",
].join("\n");

const html = renderToStaticMarkup(
  createElement(AgentMarkdown, { content: rich }),
);

const streamingHtml = renderToStaticMarkup(
  createElement(AgentMarkdown, { content: "Answer is **partial**", streaming: true }),
);

const partialFence = renderToStaticMarkup(
  createElement(AgentMarkdown, { content: "intro\n\n```ts\nconst x = 1;" }),
);

const emptyHtml = renderToStaticMarkup(
  createElement(AgentMarkdown, { content: "   " }),
);

const checks: Array<[string, boolean]> = [
  // Tables — the owner's explicit requirement.
  ["real <table> element", /<table/.test(html)],
  ["table wrapper scrolls horizontally", /overflow-x-auto rounded-xl border border-border\/60/.test(html)],
  ["thead + header cells", /<thead[^>]*>[\s\S]*<th/.test(html)],
  ["tbody rows", /<tbody[^>]*>[\s\S]*<td/.test(html)],
  ["three table cells per row", /<td[^>]*>yes<\/td>/.test(html) && /<td[^>]*>no<\/td>/.test(html)],
  ["bold inside table cell", /<strong[^>]*>yes<\/strong>/.test(html)],

  // Headings, emphasis, links.
  ["h2 heading", /<h2[^>]*>Comparison<\/h2>/.test(html)],
  ["bold text", /<strong[^>]*>voice<\/strong>/.test(html)],
  ["italic text", /<em[^>]*>chat<\/em>/.test(html)],
  ["link opens new tab safely", /<a[^>]*href="https:\/\/example\.com"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/.test(html)],

  // Lists + GFM task lists.
  ["unordered list", /<ul[^>]*>[\s\S]*<li[^>]*>task one/.test(html)],
  ["task-list checkbox", /<input[^>]*type="checkbox"[^>]*>/.test(html)],

  // Code.
  ["python language chip", /Python<\/span>/.test(html)],
  ["copy button affordance", /aria-label="Copy code"/.test(html)],
  ["block code preserves text", /def greet\(name\):/.test(html)],
  ["plain fence keeps text", /no language here/.test(html)],
  ["inline code chip", /border-border\/50 bg-muted\/70/.test(html)],

  // Blockquote + hr.
  ["blockquote styled", /<blockquote[^>]*>[\s\S]{0,160}quoted wisdom/.test(html)],
  ["horizontal rule", /<hr/.test(html)],

  // Streaming caret (single quotes are HTML-escaped as &#x27; in static markup).
  ["caret present while streaming", /:after:content-\[(?:&#x27;|'){2}\]/.test(streamingHtml)],
  ["caret absent when idle", !/:after:content-\[/.test(html)],

  // Robustness.
  ["partial fence renders without throwing", /const x = 1;/.test(partialFence)],
  ["empty content renders nothing", emptyHtml === ""],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}

if (failed > 0) {
  console.error(`\n${failed} structural check(s) failed. HTML:\n${html.slice(0, 3000)}`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} structural checks passed.`);
