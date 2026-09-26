"use client";

/**
 * Route-level error boundary: a failing screen shows a recoverable message
 * inside the app instead of taking the whole page down to global-error.
 */

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[route-error]", error);
  }, [error]);

  return (
    <main className="flex min-h-[60dvh] items-center justify-center px-4 py-16">
      <div role="alert" className="max-w-md text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
        </span>
        <h1 className="text-xl font-bold text-foreground">Something went wrong on this screen</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your data is safe. Try again, and if it keeps happening, contact support
          {error.digest ? <> with reference <code className="font-mono text-xs">{error.digest}</code></> : null}.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
          <Link href="/dashboard" className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent">
            Back to workspace
          </Link>
        </div>
      </div>
    </main>
  );
}
