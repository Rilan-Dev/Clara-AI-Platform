"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type MarkdownMessageProps = {
  content: string;
  variant: "assistant" | "user";
};

type MarkdownCodeProps = {
  inline?: boolean;
  className?: string;
  children?: ReactNode;
};

const baseHeading = "font-semibold text-[color:var(--color-foreground)]";

const markdownClasses = {
  container:
    "prose prose-sm max-w-none text-[color:var(--color-foreground)] dark:prose-invert leading-relaxed selection:bg-primary/30 prose-headings:font-semibold prose-pre:bg-transparent",
  list: "pl-5 marker:text-[color:var(--color-primary)]",
  tableWrapper:
    "my-4 overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/60",
  table: "min-w-full divide-y divide-[color:var(--color-border)] text-sm",
  tableHead:
    "bg-[color:var(--color-muted)] text-left text-xs uppercase tracking-[0.25em] text-[color:var(--color-muted-foreground)]",
  quote:
    "border-l-2 border-[color:var(--color-primary)]/60 bg-[color:var(--color-primary)]/10 px-4 py-2 italic text-[color:var(--color-foreground)]",
};

const renderers: Components = {
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 {...props} className={cn(baseHeading, "text-2xl")} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 {...props} className={cn(baseHeading, "text-xl")} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 {...props} className={cn(baseHeading, "text-lg")} />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p
      {...props}
      className="leading-relaxed text-[color:var(--color-foreground)]"
    />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul {...props} className={cn("space-y-2", markdownClasses.list)} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol {...props} className={cn("space-y-2", markdownClasses.list)} />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => (
    <li {...props} className="text-[color:var(--color-foreground)]" />
  ),
  code: (props) => {
    const { inline, className, children, ...rest } = props as MarkdownCodeProps;

    if (inline) {
      return (
        <code
          {...rest}
          className={cn(
            "rounded-md bg-[color:var(--color-muted)] px-1.5 py-0.5 text-[13px] text-[color:var(--color-primary)]",
            className
          )}
        >
          {children}
        </code>
      );
    }

    return (
      <pre className="overflow-x-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/70 p-4 text-sm text-[color:var(--color-foreground)]">
        <code
          {...rest}
          className={cn(
            "whitespace-pre-wrap text-[13px] leading-relaxed",
            className
          )}
        >
          {children}
        </code>
      </pre>
    );
  },
  table: (props: React.TableHTMLAttributes<HTMLTableElement>) => (
    <div className={markdownClasses.tableWrapper}>
      <table
        {...props}
        className={cn("w-full border-collapse", markdownClasses.table)}
      />
    </div>
  ),
  thead: (props: React.TableHTMLAttributes<HTMLTableSectionElement>) => (
    <thead {...props} className={markdownClasses.tableHead} />
  ),
  tbody: (props: React.TableHTMLAttributes<HTMLTableSectionElement>) => (
    <tbody {...props} className="divide-y divide-[color:var(--color-border)]" />
  ),
  th: (props: React.HTMLAttributes<HTMLTableCellElement>) => (
    <th
      {...props}
      className={cn(
        "px-4 py-3 text-xs font-semibold text-[color:var(--color-foreground)]",
        props.className
      )}
    />
  ),
  td: (props: React.HTMLAttributes<HTMLTableCellElement>) => (
    <td
      {...props}
      className={cn(
        "px-4 py-3 text-sm text-[color:var(--color-foreground)]",
        props.className
      )}
    />
  ),
  blockquote: (props: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote {...props} className={markdownClasses.quote} />
  ),
  hr: () => <hr className="my-6 border-[color:var(--color-border)]/60" />,
};

export function MarkdownMessage({ content, variant }: MarkdownMessageProps) {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  return (
    <div
      className={cn(
        markdownClasses.container,
        variant === "assistant" &&
          "prose-headings:text-[color:var(--color-primary)]"
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={renderers}>
        {trimmed}
      </ReactMarkdown>
    </div>
  );
}
