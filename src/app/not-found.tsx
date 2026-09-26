import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <LogoMark className="mx-auto mb-6" />
        <p className="text-sm font-semibold text-primary">404</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">We couldn&apos;t find that page</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may be old, or the agent or knowledge base may have been moved or deleted.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/dashboard" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            Go to your workspace
          </Link>
          <Link href="/" className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent">
            Clara AI home
          </Link>
        </div>
      </div>
    </main>
  );
}
