"use client";

import Link from "next/link";
import { JSX, useMemo, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";
import { cn } from "@/lib/utils";

type UploadState =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type StepStatus = "pending" | "active" | "complete" | "error";

type Step = {
  id: string;
  label: string;
  description: string;
  status: StepStatus;
};

function buildInitialSteps(): Step[] {
  return [
    {
      id: "upload",
      label: "Transfer source",
      description: "Uploading file or fetching remote URL.",
      status: "pending",
    },
    {
      id: "extract",
      label: "Extract knowledge",
      description: "Parsing text, tables, and media content.",
      status: "pending",
    },
    {
      id: "embed",
      label: "Generate embeddings",
      description: "Projecting chunks into vector space.",
      status: "pending",
    },
    {
      id: "complete",
      label: "Sync to Qdrant",
      description: "Persisting points and citations.",
      status: "pending",
    },
  ];
}

const STEP_STATUS_CLASSES: Record<StepStatus, string> = {
  pending: "border-border/60 bg-surface/40 text-muted-foreground",
  active: "border-primary/40 bg-primary/20 text-primary-foreground",
  complete: "border-success/40 bg-success/20 text-success-foreground",
  error: "border-destructive/40 bg-destructive/20 text-destructive-foreground",
};

export function AdminIngestWorkspace(): JSX.Element {
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const [steps, setSteps] = useState<Step[]>(() => buildInitialSteps());
  const timersRef = useRef<NodeJS.Timeout[]>([]);

  const resetSteps = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setSteps(buildInitialSteps());
  };

  const stageProgression = useMemo(
    () => [
      { delay: 0, index: 0, status: "active" as StepStatus },
      { delay: 1100, index: 0, status: "complete" as StepStatus },
      { delay: 1100, index: 1, status: "active" as StepStatus },
      { delay: 2400, index: 1, status: "complete" as StepStatus },
      { delay: 2400, index: 2, status: "active" as StepStatus },
      { delay: 3600, index: 2, status: "complete" as StepStatus },
      { delay: 3600, index: 3, status: "active" as StepStatus },
    ],
    []
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");
    const urlValue = formData.get("url");

    const hasFile = file instanceof File && file.size > 0;
    const hasUrl = typeof urlValue === "string" && urlValue.trim().length > 0;

    if (!hasFile && !hasUrl) {
      setState({
        status: "error",
        message: "Upload a document or provide a source URL to ingest.",
      });
      resetSteps();
      return;
    }

    resetSteps();
    setState({ status: "uploading" });

    stageProgression.forEach(({ delay, index, status }) => {
      const timer = setTimeout(() => {
        setSteps((prev) =>
          prev.map((step, idx) => (idx === index ? { ...step, status } : step))
        );
      }, delay);
      timersRef.current.push(timer);
    });

    try {
      const response = await fetch(apiUrl("/api/ingest"), {
        method: "POST",
        headers: withAuthHeaders(),
        body: formData,
      });

      const payload = (await response.json()) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Upload failed.");
      }

      form.reset();
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      setSteps((prev) => prev.map((step) => ({ ...step, status: "complete" })));
      setState({
        status: "success",
        message: payload.message ?? "Ingestion completed.",
      });
    } catch (error) {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      setSteps((prev) =>
        prev.map((step) =>
          step.status === "complete"
            ? step
            : step.status === "active"
            ? { ...step, status: "error" }
            : { ...step, status: "pending" }
        )
      );
      setState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Unexpected upload error.",
      });
    }
  };

  return (
    <div className="relative flex flex-col min-h-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 pointer-events-none -z-10">
        <div className="absolute -top-48 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/20 blur-[140px]" />
        <div className="absolute bottom-[-160px] right-16 h-96 w-96 rounded-full bg-secondary/15 blur-[160px]" />
      </div>

      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="flex flex-col w-full max-w-5xl gap-3 px-6 py-6 mx-auto sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.45em] text-muted-foreground">
              Clara Knowledge Studio
            </p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
              Knowledge Ingestion Pipeline
            </h1>
            <p className="max-w-2xl mt-2 text-sm text-muted-foreground">
              Drop in documents or link a live page so Clara can extract, embed,
              and sync everything straight into your vector store.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm transition border rounded-full border-border/60 bg-card/20 text-foreground hover:border-primary/40 hover:text-primary"
          >
            <span aria-hidden>{"<"}</span>
            Back to assistant
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10 lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="flex flex-col gap-8 p-8 rounded-3xl border-border/60 bg-card/10 shadow-glow">
          <CardHeader className="p-0 space-y-2">
            <CardTitle className="text-lg font-semibold text-foreground">
              Upload knowledge sources
            </CardTitle>
            <CardDescription className="mt-2 text-sm text-muted-foreground">
              Accepted formats include PDF, DOCX, spreadsheets, Markdown, HTML,
              JSON, and plain text. Prefer crawling? Leave the file empty and
              specify a source URL instead.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0 space-y-6">
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="p-5 border rounded-2xl border-border/60 bg-surface/40">
                <Label
                  htmlFor="file"
                  className="text-xs uppercase tracking-[0.35em] text-muted-foreground/80"
                >
                  Document file
                </Label>
                <div className="flex flex-col gap-3 p-5 mt-3 text-sm border border-dashed rounded-2xl border-border/60 bg-surface/50 text-muted-foreground">
                  <Input
                    id="file"
                    name="file"
                    type="file"
                    accept=".pdf,.docx,.txt,.md,.html,.htm,.json,.csv,.xlsx,.xls,.xlsm"
                    className="px-4 py-3 text-sm border cursor-pointer border-border/60 bg-surface/60 text-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground hover:file:bg-primary/90"
                  />
                  <p className="text-xs text-muted-foreground/80">
                    Upload a file <strong>or</strong> leave it empty to ingest
                    only from the Source URL. Raw files stay in memory and only
                    embeddings are persisted.
                  </p>
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label
                    htmlFor="title"
                    className="text-xs uppercase tracking-[0.35em] text-muted-foreground/80"
                  >
                    Display title
                  </Label>
                  <Input
                    id="title"
                    name="title"
                    type="text"
                    placeholder="e.g. BRD - Smart Modular Infrastructure"
                    className="px-4 py-3 text-sm rounded-2xl border-border/60 bg-surface/60 text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/40"
                    maxLength={120}
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="url"
                    className="text-xs uppercase tracking-[0.35em] text-muted-foreground/80"
                  >
                    Source URL
                  </Label>
                  <Input
                    id="url"
                    name="url"
                    type="url"
                    placeholder="https://example.com/docs"
                    className="px-4 py-3 text-sm rounded-2xl border-border/60 bg-surface/60 text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/40"
                    maxLength={200}
                  />
                </div>
              </div>

              <div>
                <Label
                  htmlFor="notes"
                  className="text-xs uppercase tracking-[0.35em] text-muted-foreground/80"
                >
                  Curation notes (optional)
                </Label>
                <Textarea
                  id="notes"
                  name="notes"
                  placeholder="Share context for the team: why is this source valuable, what collections should it join, and who must review it?"
                  className="mt-2 min-h-[120px] rounded-2xl border-border/60 bg-surface/60 px-4 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/40"
                  maxLength={800}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-xs text-muted-foreground/80">
                  Need automation? Trigger this workflow from CI with the{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    scripts/ingest.ts
                  </code>{" "}
                  helper.
                </p>
                <Button
                  type="submit"
                  disabled={state.status === "uploading"}
                  className="h-[52px] rounded-2xl bg-gradient-to-r from-primary via-secondary to-primary px-6 text-sm font-semibold text-primary-foreground shadow-glow transition hover:from-primary/90 hover:via-secondary/90 hover:to-primary/90"
                >
                  {state.status === "uploading"
                    ? "Processing..."
                    : "Ingest source"}
                </Button>
              </div>
            </form>

            {state.status === "success" && (
              <Alert className="rounded-2xl border-success/50 bg-success/10 text-success-foreground">
                <AlertTitle>Upload complete</AlertTitle>
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            )}

            {state.status === "error" && (
              <Alert variant="destructive" className="rounded-2xl">
                <AlertTitle>Upload failed</AlertTitle>
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <section className="flex flex-col justify-between gap-6 p-6 border rounded-3xl border-border/60 bg-card/10">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Live pipeline status
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Follow each stage as your knowledge synchronizes with the vector
              store.
            </p>
            <ul className="mt-6 space-y-4">
              {steps.map((step, index) => (
                <li
                  key={step.id}
                  className="flex items-start gap-4 p-4 border rounded-2xl border-border/50 bg-surface/30"
                >
                  <span
                    className={cn(
                      "mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold",
                      STEP_STATUS_CLASSES[step.status]
                    )}
                  >
                    {index + 1}
                  </span>
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold text-foreground">
                      {step.label}
                    </p>
                    <p className="text-muted-foreground">{step.description}</p>
                  </div>
                  <span className="ml-auto text-xs uppercase tracking-[0.35em] text-muted-foreground/80">
                    {step.status === "pending" && "Pending"}
                    {step.status === "active" && "In progress"}
                    {step.status === "complete" && "Done"}
                    {step.status === "error" && "Error"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-5 text-sm border rounded-2xl border-border/60 bg-surface/40 text-muted-foreground">
            <h4 className="text-sm font-semibold text-foreground">
              Tips from the Lovable playbook
            </h4>
            <ul className="mt-3 space-y-2 list-disc list-inside marker:text-primary">
              <li>
                Prioritize PRDs, user flows, and UI guidelines - the custom
                knowledge base keeps Lovable suggestions on message.
              </li>
              <li>
                Ingest Supabase setup steps and authentication policies so
                engineers can troubleshoot creds without context switching.
              </li>
              <li>
                Pull publishing references (SEO, custom domain, shareable URLs)
                ahead of launch readiness reviews.
              </li>
              <li>
                Upload large batches sequentially to monitor the pipeline log
                and maintain traceability.
              </li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
