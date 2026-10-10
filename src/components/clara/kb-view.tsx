"use client";

import { useCallback, useEffect, useState } from "react";
import { api, readError, useClara } from "@/lib/store";
import { UsageBar } from "@/components/clara/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Database, Plus, Upload, Lock } from "lucide-react";

type Kb = {
  id: string;
  name: string;
  embeddingModelId: string;
  dimensions: number;
  bytes: number;
};
type KbResponse = {
  kbs: Kb[];
  catalogue: { id: string; displayName: string; dimensions: number; tier: number }[];
};

function fmtBytes(b: number) {
  if (b >= 1024 * 1048576) return `${(b / (1024 * 1048576)).toFixed(2)} GB`;
  if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}

export function KbView({
  userId,
  orgId,
  kbsLimit,
}: {
  userId: string;
  orgId: string;
  kbsLimit: number;
}) {
  const { openUpgradeSheet, showToast } = useClara();
  const [data, setData] = useState<KbResponse | null>(null);
  const [meters, setMeters] = useState<{
    storageUsedBytes: number;
    storageLimitBytes: number;
    kbs: number;
  } | null>(null);
  const [newName, setNewName] = useState("");
  const [embeddingModel, setEmbeddingModel] = useState("text-embedding-3-small");
  const [creating, setCreating] = useState(false);
  const [uploadKb, setUploadKb] = useState<string | null>(null);
  const [docName, setDocName] = useState("");
  const [docMb, setDocMb] = useState("2");
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const [kbRes, mRes] = await Promise.all([
      api(`/api/kb`, userId),
      api(`/api/meters?orgId=${orgId}`, userId),
    ]);
    if (kbRes.ok) setData(await kbRes.json());
    if (mRes.ok) {
      const m = await mRes.json();
      setMeters({
        storageUsedBytes: m.storageUsedBytes,
        storageLimitBytes: m.storageLimitBytes,
        kbs: m.kbs,
      });
    }
  }, [userId, orgId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const atKbLimit = kbsLimit !== -1 && (meters?.kbs ?? 0) >= kbsLimit;

  const createKb = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await api("/api/kb", userId, {
        method: "POST",
        body: JSON.stringify({ name: newName, embeddingModelId: embeddingModel }),
      });
      if (res.ok) {
        showToast(`Knowledge base created — CONFIG audit row written`, "success");
        setNewName("");
        await load();
      } else {
        const err = await readError(res);
        if (res.status === 402) {
          openUpgradeSheet({
            code: err.code,
            message: err.message,
            plan: err.upgrade?.plan,
            planName: err.upgrade?.planName,
            reason: err.upgrade?.reason,
          });
        } else {
          showToast(err.message ?? "Create failed", "error");
        }
      }
    } finally {
      setCreating(false);
    }
  };

  const uploadDoc = async () => {
    if (!uploadKb || !docName.trim()) return;
    setUploading(true);
    try {
      const res = await api("/api/kb/document", userId, {
        method: "POST",
        body: JSON.stringify({
          kbId: uploadKb,
          fileName: docName.trim(),
          sizeBytes: Math.max(1, Math.round(parseFloat(docMb || "0") * 1048576)),
        }),
      });
      if (res.ok) {
        showToast("Document ingested — EMBEDDING usage event + audit row written", "success");
        setDocName("");
        setUploadKb(null);
        await load();
      } else {
        const err = await readError(res);
        if (res.status === 402) {
          openUpgradeSheet({
            code: err.code,
            message: err.message,
            plan: err.upgrade?.plan,
            planName: err.upgrade?.planName,
            reason: err.upgrade?.reason,
          });
        } else {
          showToast(err.message ?? "Upload failed", "error");
        }
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6 overflow-y-auto p-4 pb-8 md:p-6">
      <header>
        <h1 className="text-xl font-semibold">Knowledge Bases</h1>
        <p className="text-sm text-muted-foreground">
          Creation and ingestion are quota-enforced server-side; every upload
          writes an EMBEDDING usage event and an audit row.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Quota</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <UsageBar
            used={meters?.kbs ?? 0}
            limit={kbsLimit}
            label="Knowledge bases"
          />
          <UsageBar
            used={Math.round((meters?.storageUsedBytes ?? 0) / 1048576)}
            limit={
              (meters?.storageLimitBytes ?? 0) === -1
                ? -1
                : Math.round((meters?.storageLimitBytes ?? 1048576) / 1048576)
            }
            label="Storage (MB)"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">New knowledge base</CardTitle>
          <CardDescription>
            The embedding dropdown only ever lists embedding models — the
            catalogue split makes chat-model misconfiguration unrepresentable.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="KB name, e.g. Product Docs"
            className="h-10 w-full sm:w-64"
            aria-label="Knowledge base name"
          />
          <select
            value={embeddingModel}
            onChange={(e) => setEmbeddingModel(e.target.value)}
            className="h-10 rounded-lg border bg-background px-3 text-sm"
            aria-label="Embedding model"
          >
            {(data?.catalogue ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName} · {c.dimensions}d
              </option>
            ))}
          </select>
          <Button
            onClick={createKb}
            disabled={creating || !newName.trim() || atKbLimit}
            className="gap-1"
            title={
              atKbLimit
                ? "Plan limit reached — the API refuses a 40th KB too"
                : undefined
            }
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : atKbLimit ? (
              <Lock className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {atKbLimit ? "At plan limit" : "Create"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(data?.kbs ?? []).map((kb) => (
          <Card key={kb.id}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <Database className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{kb.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtBytes(kb.bytes)} · {kb.embeddingModelId}
                  </p>
                </div>
                <Badge variant="outline" className="tabular-nums">
                  {kb.dimensions}d
                </Badge>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 w-full gap-1"
                onClick={() => setUploadKb(kb.id)}
              >
                <Upload className="h-3.5 w-3.5" />
                Ingest document
              </Button>
            </CardContent>
          </Card>
        ))}
        {data && data.kbs.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
            No knowledge bases yet.
          </p>
        )}
      </div>

      {uploadKb && (
        <Card className="mx-auto w-full max-w-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ingest document</CardTitle>
            <CardDescription>
              Simulated presigned upload → validation → embedding job. Storage
              is quota-checked atomically before anything is written.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="File name, e.g. handbook-2026.pdf"
              aria-label="File name"
            />
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0.1"
                step="0.5"
                value={docMb}
                onChange={(e) => setDocMb(e.target.value)}
                className="w-32"
                aria-label="Size in MB"
              />
              <span className="text-sm text-muted-foreground">MB</span>
              <Button
                onClick={uploadDoc}
                disabled={uploading || !docName.trim()}
                className="ml-auto gap-1"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload & embed
              </Button>
              <Button variant="ghost" onClick={() => setUploadKb(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
