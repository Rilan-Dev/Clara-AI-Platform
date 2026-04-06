/**
 * src/app/(platform)/docs/layout.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Next.js nested layout — applied to every route under /docs/*.
 * Wraps content in the shared docs sidebar shell.
 */
import DocsLayout from "@/features/platform/layouts/docs-layout";

export default function DocsRouteLayout({ children }: { children: React.ReactNode }) {
  return <DocsLayout>{children}</DocsLayout>;
}
