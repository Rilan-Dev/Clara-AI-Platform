"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Bot,
  Brain,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  FlaskConical,
  GitBranch,
  LockKeyhole,
  Plug,
  ShieldCheck,
  TerminalSquare,
  Wrench,
  XCircle,
} from "lucide-react";
import { ProvidersWorkspace } from "./ProvidersWorkspace";
import { cn } from "@/lib/utils";
import { usePlatformFeatures } from "@/features/admin/use-platform-features";

type Tab = "overview" | "providers" | "tools" | "integrations" | "agent-loop" | "verification";

type AiPlatformWorkspaceProps = {
  toolCallingEnabled: boolean;
  agentLoopEnabled: boolean;
};

const tabs: Array<{ id: Tab; label: string; icon: typeof Brain }> = [
  { id: "overview", label: "Overview", icon: Brain },
  { id: "providers", label: "Providers", icon: Activity },
  { id: "tools", label: "Tool Runtime", icon: Wrench },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "agent-loop", label: "Agent Loop", icon: Bot },
  { id: "verification", label: "Verification", icon: ShieldCheck },
];

function StatusPill({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        enabled
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-border bg-muted/50 text-muted-foreground",
      )}
    >
      {enabled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDot className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

function Metric({
  value,
  label,
  tone = "default",
}: {
  value: string;
  label: string;
  tone?: "default" | "success" | "warning";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div
        className={cn(
          "text-2xl font-semibold tracking-tight",
          tone === "success" && "text-emerald-600 dark:text-emerald-400",
          tone === "warning" && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function AiPlatformWorkspace({
  toolCallingEnabled,
  agentLoopEnabled,
}: AiPlatformWorkspaceProps) {
  const [tab, setTab] = useState<Tab>("overview");
  const features = usePlatformFeatures();
  const visibleTab = !features.integrations && tab === "integrations" ? "overview" : tab;

  const runtimeStages = useMemo(
    () => [
      { label: "Host execution context", status: "Ready", icon: LockKeyhole },
      { label: "Unified Tool Runtime", status: "Ready", icon: Wrench },
      { label: "OpenAI tool calling", status: toolCallingEnabled ? "Enabled" : "Default off", icon: Activity },
      { label: "Bounded agent loop", status: agentLoopEnabled ? "Enabled" : "Default off", icon: Bot },
      ...(features.integrations ? [{ label: "Integrations I-1 contracts", status: "Implemented", icon: Plug }] : []),
    ],
    [toolCallingEnabled, agentLoopEnabled, features.integrations],
  );

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card to-primary/[0.06]">
        <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                <Brain className="h-3.5 w-3.5" />
                AI Platform Core
              </span>
              {features.integrations && <StatusPill enabled={true} label="Integrations I-1 active" />}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              AI Platform workspace
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              The control surface for Clara&apos;s provider-agnostic tool runtime and the active
              provider and tool configuration. Optional integrations run only when enabled in this deployment.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTab("providers")}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Provider control plane
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setTab("agent-loop")}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              Pilot status
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>        </div>

        <div className="grid grid-cols-2 border-t border-border sm:grid-cols-4">
          <div className="border-r border-border p-4 sm:p-5">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Current scope</div>
            <div className="mt-1 font-semibold">{features.integrations ? "Integrations I-1" : "AI Platform Core"}</div>
          </div>
          <div className="border-b border-r border-border p-4 sm:border-b-0 sm:p-5">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">First tool</div>
            <div className="mt-1 font-semibold font-mono text-sm">rag_search</div>
          </div>
          <div className="border-r border-border p-4 sm:p-5">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">I-1 boundary</div>
            <div className="mt-1 font-semibold">Contracts only</div>
          </div>
          <div className="p-4 sm:p-5">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Persistence</div>
            <div className="mt-1 font-semibold">Not authorized</div>
          </div>
        </div>
      </header>

      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1.5" aria-label="AI Platform">
        {tabs.filter((item) => features.integrations || item.id !== "integrations").map((item) => {
          const Icon = item.icon;
          const active = visibleTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {tab === "overview" && (
        <div className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric value="7-A" label="Host seam" tone="success" />
            <Metric value="7-B" label="Unified Tool Runtime" tone="success" />
            <Metric value="7-C" label="Bounded pilot" tone={toolCallingEnabled ? "success" : "warning"} />
            <Metric value="8" label="Hard iteration ceiling" />
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">Implementation pipeline</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The reusable runtime foundation and the active integration contract boundary.
                  </p>
                </div>
                <TerminalSquare className="h-5 w-5 text-primary" />
              </div>
              <div className="mt-5 space-y-3">
                {runtimeStages.map((stage, index) => {
                  const Icon = stage.icon;
                  const active = stage.status === "Ready" || stage.status === "Enabled";
                  return (
                    <div key={stage.label} className="flex items-center gap-3 rounded-xl border border-border/80 p-3">
                      <div className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                        active ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground",
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{stage.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {index < 2 ? "Production-safe foundation" : "Explicit feature flag required"}
                        </div>
                      </div>
                      <span className={cn(
                        "text-xs font-medium",
                        active ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                      )}>
                        {stage.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">Pilot safety boundary</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Explicitly visible so testing cannot be confused with autonomous production execution.
                  </p>
                </div>
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div className="mt-5 space-y-3">
                {[
                  "Provider payloads cannot bypass the Unified Tool Runtime.",
                  "ExecutionContext provenance is required for every tool invocation.",
                  "The agent loop is capped at eight iterations.",
                  "Tool invocation telemetry remains audit-only.",
                  "MCP, integrations, memory and skills are not enabled by this pilot.",
                ].map((item) => (
                  <div key={item} className="flex gap-2.5 text-sm leading-5 text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold">Ready for hands-on verification</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start with Integrations to inspect the new trust boundary, then inspect the
                  Unified Tool Runtime and provider surfaces. Runtime execution is not yet authorized.
                </p>
              </div>
              {features.integrations && <button
                type="button"
                onClick={() => setTab("integrations")}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Inspect Integrations
                <ChevronRight className="h-4 w-4" />
              </button>}
            </div>
          </section>
        </div>
      )}

      {tab === "providers" && (
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
          <div className="mb-5">
            <h2 className="text-lg font-semibold">Provider control plane</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure and verify the provider capabilities consumed by the new platform layer.
            </p>
          </div>
          <ProvidersWorkspace />
        </section>
      )}

      {tab === "tools" && (
        <div className="space-y-5">
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">Unified Tool Runtime</h2>
                </div>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Every provider-originated tool call must pass through this registry,
                  authorization layer, schema validation and normalized result boundary.
                </p>
              </div>
              <StatusPill enabled={true} label="Runtime ready" />
            </div>

            <div className="mt-6 overflow-hidden rounded-2xl border border-border">
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-border bg-muted/30 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Registered tool</span>
                <span>Surfaces</span>
                <span>Status</span>
              </div>
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-4">
                <div>
                  <div className="font-mono text-sm font-semibold">rag_search</div>
                  <div className="mt-1 text-xs text-muted-foreground">Tenant-bound Clara knowledge retrieval</div>
                </div>
                <span className="text-xs text-muted-foreground">Realtime · Embed</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Registered
                </span>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            {[
              ["Input validation", "Zod-backed schema", "query + ragMode"],
              ["Authorization", "Fail closed", "surface + entitlement + RBAC"],
              ["Result contract", "Normalized", "typed errors + tool events"],
            ].map(([title, value, detail]) => (
              <div key={title} className="rounded-2xl border border-border bg-card p-5">
                <div className="text-xs text-muted-foreground">{title}</div>
                <div className="mt-2 font-semibold">{value}</div>
                <div className="mt-1 font-mono text-[11px] text-muted-foreground">{detail}</div>
              </div>
            ))}
          </section>
        </div>
      )}

      {features.integrations && visibleTab === "integrations" && (
        <div className="space-y-5">
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Plug className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">Integrations Framework · I-1</h2>
                </div>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Host-neutral contracts are implemented. This surface intentionally exposes
                  the trust boundary without pretending that OAuth, persistence or action execution exists yet.
                </p>
              </div>
              <StatusPill enabled={true} label="Contracts implemented" />
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric value="7" label="Explicit adapter ports" tone="success" />
              <Metric value="0" label="Database changes" tone="success" />
              <Metric value="0" label="OAuth transports" />
              <Metric value="0" label="Outbound executors" />
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            {[
              ["Catalog", "IntegrationDescriptor + catalog adapter", "Implemented"],
              ["Connections", "Tenant/project/user-scoped connection references", "Implemented"],
              ["Credentials", "Opaque credential handles only", "Implemented"],
              ["OAuth", "Protocol boundary + callback data", "Port only"],
              ["Actions", "Zod input schemas + runner port", "Contract only"],
              ["Egress", "Explicit SSRF/egress policy adapter", "Port only"],
              ["Tool bridge", "Integration action → Unified Tool Runtime", "Contract only"],
              ["Observability", "Redaction-safe operational boundary", "Contract only"],
            ].map(([title, detail, state]) => (
              <div key={title} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold">{title}</h3>
                  <span className={cn(
                    "text-[11px] font-medium",
                    state === "Implemented" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                  )}>
                    {state}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-5 text-muted-foreground">{detail}</p>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <h3 className="font-semibold">I-1 stopping boundary</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Database migrations, OAuth routes/token exchange, credential-vault implementation,
                  Activepieces runtime, outbound HTTP/SSRF execution, integration action execution,
                  deployment and billing changes are deliberately unavailable in this slice.
                </p>
              </div>
            </div>
          </section>
        </div>
      )}

      {tab === "agent-loop" && (
        <div className="space-y-5">
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">Bounded Agent Loop</h2>
                </div>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                  A deliberately small orchestration primitive: provider turn → tool call →
                  Unified Tool Runtime → tool result → next provider turn.
                </p>
              </div>
              <StatusPill enabled={agentLoopEnabled} label={agentLoopEnabled ? "Enabled" : "Default off"} />
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Metric value="8" label="Hard maximum iterations" />
              <Metric value="3" label="Default maximum iterations" />
              <Metric value={agentLoopEnabled ? "ON" : "OFF"} label="Runtime flag" tone={agentLoopEnabled ? "success" : "warning"} />
            </div>

            <div className="mt-5 rounded-2xl border border-dashed border-border p-5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FlaskConical className="h-4 w-4 text-primary" />
                Pilot execution
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The loop is intentionally not exposed as a general autonomous-agent launcher.
                It is only reachable from an explicitly enabled provider/tool-calling path.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-lg bg-muted px-3 py-2 text-xs font-medium">ENABLE_AI_PLATFORM_TOOL_CALLING</span>
                <span className="rounded-lg bg-muted px-3 py-2 text-xs font-medium">ENABLE_AI_PLATFORM_AGENT_LOOP</span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-5">
            <div className="flex items-start gap-3">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <h3 className="font-medium">Not yet autonomous</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  MCP, integrations, memory, skills, background execution and first-class
                  billable tool metering are deliberately outside this pilot.
                </p>
              </div>
            </div>
          </section>
        </div>
      )}

      {tab === "verification" && (
        <div className="space-y-5">
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <GitBranch className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h2 className="text-lg font-semibold">Integrations I-1 verification</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Gate C is the current blocker. The contract implementation has passed scope and
                  architectural review, but executable CI evidence is still required before closure.
                </p>
              </div>
            </div>
            <div className="mt-5 space-y-2">
              {[
                ["Scope", "PASS", true],
                ["Host-neutral contracts", "PASS", true],
                ["Threat model", "PASS", true],
                ["Focused Vitest / typecheck / lint", "PENDING CI", false],
                ["Gate D final review", "PENDING", false],
                ["Database / migrations", "NOT APPLICABLE", true],
                ["Deployment", "NOT APPLICABLE", true],
              ].map(([item, state, ok]) => (
                <div key={item as string} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                  {ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <CircleDot className="h-4 w-4 text-amber-500" />
                  )}
                  <span className="flex-1 text-sm">{item as string}</span>
                  <span className={cn(
                    "text-[11px] font-medium",
                    ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
                  )}>
                    {state as string}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-5">
            <div className="flex items-start gap-3">
              <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <h3 className="font-medium">Next authorization boundary</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  I-2 (Clara adapters), OAuth transport, persistence, credential storage,
                  egress execution and integration actions remain locked until I-1 receives
                  executable Gate-C evidence and final Gate-D review.
                </p>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
