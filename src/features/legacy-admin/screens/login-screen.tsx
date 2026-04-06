"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/modules/admin-ui/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    console.log('email ', email);
    console.log('password ', password);
    try {
      await login(email, password);
      router.push("/admin/orgs");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {/* Background blobs */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 left-1/4 h-80 w-80 rounded-full bg-primary/20 blur-[160px]" />
        <div className="absolute bottom-[-80px] right-1/4 h-80 w-80 rounded-full bg-secondary/15 blur-[140px]" />
      </div>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-glow">
            <span className="text-2xl font-bold text-primary-foreground">C</span>
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">Clara Admin</h1>
            <p className="text-sm text-muted-foreground">Sign in to manage your knowledge bases</p>
          </div>
        </div>

        {/* Form */}
        <div className="rounded-2xl border border-card-border bg-card p-8 shadow-medium">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email" type="email" autoComplete="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password" type="password" autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" disabled={loading}
              />
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" variant="default" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  Signing in…
                </span>
              ) : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
