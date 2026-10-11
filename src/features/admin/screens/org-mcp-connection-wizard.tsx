"use client";
/**
 * Organisation → Integrations → Add MCP Server — multi-step wizard.
 *
 * Steps:
 *   1. Connection basics (name, description, endpoint)
 *   2. Authentication method + secure credential entry
 *   3. Live validation (SSRF policy → MCP handshake → tool discovery)
 *   4. Approve discovered tools + review plan entitlements/limits
 *   5. Save → navigate to the connection detail screen
 *
 * Every validation runs server-side against the real endpoint; nothing is
 * persisted until the final step.
 */
import { useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Check, Loader2, AlertCircle, Server,
  ShieldCheck, Wrench, KeyRound, Info, ExternalLink,
} from "lucide-react";

type AuthMethod = "none" | "bearer_token" | "basic_auth" | "api_key_header";

type AuthField = { name: string; label: string; secret: boolean; required: boolean; hint?: string };

const AUTH_METHODS: Array<{ value: AuthMethod; label: string; description: string; fields: AuthField[] }> = [
  {
    value: "none",
    label: "No authentication",
    description: "The endpoint is open (public test servers only).",
    fields: [],
  },
  {
    value: "bearer_token",
    label: "Bearer token",
    description: "Sent as an Authorization: Bearer header on every request.",
    fields: [
      { name: "token", label: "Bearer token", secret: true, required: true, hint: "Encrypted at rest; never shown again." },
    ],
  },
  {
    value: "basic_auth",
    label: "Basic authentication",
    description: "Standard username + password (HTTP Basic).",
    fields: [
      { name: "username", label: "Username", secret: false, required: true },
      { name: "password", label: "Password", secret: true, required: true, hint: "Encrypted at rest." },
    ],
  },
  {
    value: "api_key_header",
    label: "API key header",
    description: "A custom header name and value of your choosing.",
    fields: [
      { name: "headerName", label: "Header name", secret: false, required: true, hint: "Example: X-API-Key" },
      { name: "headerValue", label: "Header value", secret: true, required: true, hint: "Encrypted at rest." },
    ],
  },
];

type ProbeResult = {
  handshake: {
    protocolVersion: string;
    serverName: string | null;
    serverVersion: string | null;
    serverTitle: string | null;
  };
  discoveredTools: Array<{
    name: string;
    title: string | null;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
  toolLimit: number;
  toolLimitExceeded: boolean;
};

const STEPS = [
  { id: 1, title: "Basics", icon: Server },
  { id: 2, title: "Authentication", icon: KeyRound },
  { id: 3, title: "Validate", icon: ShieldCheck },
  { id: 4, title: "Approve tools", icon: Wrench },
  { id: 5, title: "Save", icon: Check },
] as const;

export default function OrgMcpConnectionWizard() {
  const { id = "" } = useParams<{ id: string }>();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("bearer_token");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authDef = AUTH_METHODS.find((m) => m.value === authMethod) ?? AUTH_METHODS[0];
  const fieldsFilled = useMemo(
    () => authDef.fields.every((f) => !f.required || credentials[f.name]?.trim()),
    [authDef, credentials],
  );
  const basicsValid = name.trim().length > 0 && /^https:\/\/.+/i.test(endpointUrl.trim());
  const approvedTools = probe
    ? probe.discoveredTools.filter((t) => approved[t.name])
    : [];

  async function runProbe() {
    setProbing(true);
    setError(null);
    setProbe(null);
    setApproved({});
    try {
      const response = await fetch(`/api/orgs/${id}/mcp/connections`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "probe",
          endpointUrl: endpointUrl.trim(),
          authType: authMethod,
          credentials,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Endpoint validation failed");
      setProbe(data as ProbeResult);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Endpoint validation failed");
    } finally {
      setProbing(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/orgs/${id}/mcp/connections`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: name.trim(),
          description: description.trim(),
          endpointUrl: endpointUrl.trim(),
          authType: authMethod,
          credentials,
          approvedToolNames: approvedTools.map((t) => t.name),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save the connection");
      router.push(`/orgs/${id}/integrations/mcp/${data.connectionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the connection");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push(`/orgs/${id}/integrations`)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border hover:bg-muted"
          aria-label="Back to integrations"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Add MCP server</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Connect an organization-owned MCP endpoint over Streamable HTTP.
          </p>
        </div>
      </div>

      {/* Stepper */}
      <ol className="flex items-center gap-1 overflow-x-auto pb-1" aria-label="Wizard progress">
        {STEPS.map((s, index) => {
          const state = step > s.id ? "done" : step === s.id ? "current" : "todo";
          return (
            <li key={s.id} className="flex min-w-0 flex-1 items-center gap-1">
              <div
                className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 py-2 ${
                  state === "current"
                    ? "border-primary/40 bg-primary/5"
                    : state === "done"
                      ? "border-emerald-600/30 bg-emerald-500/5"
                      : "border-border bg-card"
                }`}
              >
                {state === "done" ? (
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <s.icon className={`h-4 w-4 shrink-0 ${state === "current" ? "text-primary" : "text-muted-foreground"}`} />
                )}
                <span className={`truncate text-xs font-medium ${state === "todo" ? "text-muted-foreground" : ""}`}>
                  {s.title}
                </span>
              </div>
              {index < STEPS.length - 1 && <div className="hidden h-px w-3 bg-border sm:block" />}
            </li>
          );
        })}
      </ol>

      {error && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Step 1 — basics */}
      {step === 1 && (
        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Connection name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="e.g. Production tool server"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/25"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Description <span className="text-muted-foreground">(optional)</span></span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="What this server provides…"
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/25"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Endpoint URL</span>
            <input
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
              inputMode="url"
              placeholder="https://mcp.example.com/mcp"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/25"
            />
            <span className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              HTTPS Streamable HTTP endpoints only. Private and internal network
              addresses are blocked by platform security policy.
            </span>
          </label>
          <div className="flex justify-end">
            <button
              onClick={() => setStep(2)}
              disabled={!basicsValid}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      {/* Step 2 — authentication */}
      {step === 2 && (
        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Authentication method</legend>
            {AUTH_METHODS.map((method) => (
              <label
                key={method.value}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                  authMethod === method.value
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <input
                  type="radio"
                  name="auth-method"
                  checked={authMethod === method.value}
                  onChange={() => {
                    setAuthMethod(method.value);
                    setCredentials({});
                  }}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{method.label}</span>
                  <span className="block text-xs text-muted-foreground">{method.description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {authDef.fields.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {authDef.fields.map((field) => (
                <label key={field.name} className="block space-y-1.5">
                  <span className="text-sm font-medium">
                    {field.label}
                    {field.required && <span className="text-red-500"> *</span>}
                  </span>
                  <input
                    type={field.secret ? "password" : "text"}
                    autoComplete={field.secret ? "new-password" : "off"}
                    value={credentials[field.name] ?? ""}
                    onChange={(e) => setCredentials((prev) => ({ ...prev, [field.name]: e.target.value }))}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/25"
                  />
                  {field.hint && <span className="block text-xs text-muted-foreground">{field.hint}</span>}
                </label>
              ))}
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted">
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!fieldsFilled}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      {/* Step 3 — live validation */}
      {step === 3 && (
        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Validate the endpoint</h2>
            <p className="text-sm text-muted-foreground">
              Clara performs a real MCP handshake and discovers the tools your server
              exposes. Nothing is saved yet.
            </p>
          </div>
          <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              <ExternalLink className="h-3.5 w-3.5" /> {endpointUrl || "—"}
            </p>
            <p className="mt-1">Auth: {authDef.label}</p>
          </div>
          {probing ? (
            <div className="flex items-center gap-3 rounded-xl border border-border p-4 text-sm">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div>
                <p className="font-medium">Handshaking with the server…</p>
                <p className="text-xs text-muted-foreground">
                  Checking security policy, negotiating the protocol and listing tools.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex justify-between">
              <button onClick={() => setStep(2)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted">
                Back
              </button>
              <button
                onClick={() => void runProbe()}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <ShieldCheck className="h-4 w-4" /> Validate endpoint
              </button>
            </div>
          )}
        </section>
      )}

      {/* Step 4 — approve tools */}
      {step === 4 && probe && (
        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">
              {probe.handshake.serverTitle ?? probe.handshake.serverName ?? "Server"} connected
            </h2>
            <p className="text-sm text-muted-foreground">
              Protocol {probe.handshake.protocolVersion}
              {probe.handshake.serverVersion ? ` · v${probe.handshake.serverVersion}` : ""} ·{" "}
              {probe.discoveredTools.length} tool{probe.discoveredTools.length === 1 ? "" : "s"} discovered.
            </p>
          </div>

          {probe.toolLimitExceeded && (
            <div role="alert" className="rounded-xl border border-amber-600/30 bg-amber-500/5 p-3 text-sm text-amber-700">
              Your plan allows {probe.toolLimit} approved tools per connection. Select at
              most {probe.toolLimit} — remaining tools stay discoverable but not approved.
            </div>
          )}

          {probe.discoveredTools.length === 0 ? (
            <p className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
              The server exposes no tools. You can still save the connection and
              re-run discovery later.
            </p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {probe.discoveredTools.map((tool) => {
                const checked = approved[tool.name] ?? false;
                const disabled =
                  !checked &&
                  probe.toolLimit !== -1 &&
                  approvedTools.length >= probe.toolLimit;
                return (
                  <li key={tool.name}>
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                        checked ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/50"
                      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={(e) =>
                          setApproved((prev) => ({ ...prev, [tool.name]: e.target.checked }))
                        }
                        className="mt-0.5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-medium">
                          {tool.title ?? tool.name}
                        </span>
                        <span className="block break-all font-mono text-[11px] text-muted-foreground">
                          {tool.name}
                        </span>
                        {tool.description && (
                          <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">
                            {tool.description}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(3)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted">
              Back
            </button>
            <button
              onClick={() => setStep(5)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      {/* Step 5 — review & save */}
      {step === 5 && probe && (
        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold">Review and save</h2>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-muted/40 p-3">
              <dt className="text-xs text-muted-foreground">Name</dt>
              <dd className="mt-0.5 break-words text-sm font-medium">{name.trim()}</dd>
            </div>
            <div className="rounded-xl bg-muted/40 p-3">
              <dt className="text-xs text-muted-foreground">Endpoint</dt>
              <dd className="mt-0.5 break-all text-sm font-medium">{endpointUrl.trim()}</dd>
            </div>
            <div className="rounded-xl bg-muted/40 p-3">
              <dt className="text-xs text-muted-foreground">Authentication</dt>
              <dd className="mt-0.5 text-sm font-medium">{authDef.label}</dd>
            </div>
            <div className="rounded-xl bg-muted/40 p-3">
              <dt className="text-xs text-muted-foreground">Tools to approve</dt>
              <dd className="mt-0.5 text-sm font-medium">
                {approvedTools.length} of {probe.discoveredTools.length} discovered
              </dd>
            </div>
          </dl>
          {approvedTools.length > 0 && (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {approvedTools.map((tool) => (
                <li key={tool.name} className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span className="break-all">{tool.title ?? tool.name}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="flex items-start gap-1.5 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Saving re-validates the endpoint server-side. Credentials are encrypted
            immediately and never displayed again.
          </p>
          <div className="flex justify-between">
            <button onClick={() => setStep(4)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted">
              Back
            </button>
            <button
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? "Saving…" : "Save connection"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
