"use client";
import { useEffect, useState } from "react";
import {
  Database, Upload, Plus, FileText,
  CheckCircle2, Clock, AlertCircle, X,
} from "lucide-react";
import {
  getKbsForOrg, getDocuments, uploadDocument,
  type KnowledgeBase, type Document,
} from "@/lib/api";
import { isApiError } from "@/lib/http";

const ORG_ID = import.meta.env.VITE_ORG_ID ?? "10000000-0000-0000-0000-000000000001";

export default function KnowledgeBasesPage() {
  const [kbs, setKbs]         = useState<KnowledgeBase[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [docs, setDocs]       = useState<Document[]>([]);
  const [tab, setTab]         = useState<"documents" | "upload" | "configure">("documents");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading]   = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    getKbsForOrg(ORG_ID)
      .then(data => {
        setKbs(data);
        if (data.length > 0) setSelected(data[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) return;
    getDocuments(selected).then(setDocs).catch(() => setDocs([]));
  }, [selected]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    setUploading(true);
    setUploadError("");
    setUploadProgress(0);

    try {
      await uploadDocument(selected, file, setUploadProgress);
      // Refresh document list after upload
      const updated = await getDocuments(selected);
      setDocs(updated);
      setTab("documents");
    } catch (err: unknown) {
      setUploadError(isApiError(err) ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      e.target.value = "";
    }
  }

  const selectedKb = kbs.find(k => k.id === selected);

  const statusIcon = (status: string) => {
    if (status === "ready")      return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    if (status === "processing") return <Clock className="w-4 h-4 text-amber-400 animate-spin" />;
    if (status === "failed")     return <AlertCircle className="w-4 h-4 text-red-400" />;
    return <Clock className="w-4 h-4 text-slate-400" />;
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* KB list sidebar */}
      <aside className="w-64 bg-[#0c1d3a] border-r border-white/[0.06] flex flex-col">
        <div className="px-4 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">Knowledge Bases</span>
          <button className="w-6 h-6 rounded-md bg-[#c8821a]/20 hover:bg-[#c8821a]/30 text-[#c8821a] flex items-center justify-center transition-colors">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {loading && <p className="text-xs text-white/30 px-2">Loading…</p>}
          {kbs.map(kb => (
            <button key={kb.id} onClick={() => setSelected(kb.id)}
              className={`w-full text-left px-3 py-3 rounded-xl text-sm transition-all ${
                selected === kb.id
                  ? "bg-[#c8821a]/15 text-white border border-[#c8821a]/25"
                  : "text-white/50 hover:text-white hover:bg-white/[0.04]"
              }`}>
              <div className="font-medium truncate mb-1">{kb.name}</div>
              <div className="text-xs text-white/30">{kb.docCount} docs · {kb.readyCount} ready</div>
            </button>
          ))}
        </div>
      </aside>

      {/* KB detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-14 px-6 flex items-center justify-between border-b border-white/[0.06] bg-[#0c1d3a]/40 shrink-0">
          <div className="flex items-center gap-3">
            <Database className="w-4 h-4 text-[#c8821a]" />
            <span className="font-semibold text-white">{selectedKb?.name ?? "Select a KB"}</span>
            {selectedKb && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${selectedKb.status === "active" ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-500/15 text-slate-400"}`}>
                {selectedKb.status}
              </span>
            )}
          </div>
          {selectedKb && (
            <div className="flex gap-2">
              {(["documents", "upload", "configure"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                    tab === t
                      ? "bg-[#c8821a]/20 text-[#c8821a] border border-[#c8821a]/30"
                      : "text-white/40 hover:text-white hover:bg-white/[0.04]"
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Database className="w-12 h-12 text-white/20 mb-4" />
              <p className="text-white/40">Select a knowledge base from the sidebar</p>
            </div>

          ) : tab === "documents" ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-white">Documents ({docs.length})</h2>
              </div>
              {docs.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-white/[0.07] rounded-2xl">
                  <FileText className="w-10 h-10 text-white/20 mx-auto mb-3" />
                  <p className="text-white/40 text-sm">No documents yet. Upload some to get started.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {docs.map(doc => (
                    <div key={doc.id} className="flex items-center gap-4 px-4 py-3 border border-white/[0.06] bg-white/[0.02] rounded-xl hover:bg-white/[0.04] transition-colors">
                      <div className="w-8 h-8 rounded-lg bg-[#c8821a]/10 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-[#c8821a]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">{doc.title || doc.originalFilename}</div>
                        <div className="text-xs text-white/30">{(doc.fileSize / 1024).toFixed(0)} KB · {doc.chunkCount} chunks</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {statusIcon(doc.status)}
                        <span className={`text-xs capitalize ${doc.status === "ready" ? "text-emerald-400" : doc.status === "failed" ? "text-red-400" : "text-amber-400"}`}>
                          {doc.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          ) : tab === "upload" ? (
            <div className="max-w-lg">
              <h2 className="font-semibold text-white mb-4">Upload Documents</h2>
              <label className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${uploading ? "border-[#c8821a]/60 bg-[#c8821a]/10" : "border-[#c8821a]/30 hover:border-[#c8821a]/60 bg-[#c8821a]/5 hover:bg-[#c8821a]/10"}`}>
                <Upload className="w-8 h-8 text-[#c8821a]/60 mb-3" />
                <span className="text-sm font-medium text-white/70">
                  {uploading ? `Uploading… ${uploadProgress}%` : "Click to upload or drag and drop"}
                </span>
                <span className="text-xs text-white/30 mt-1">PDF, DOCX, TXT — max 50MB</span>
                <input type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={handleUpload} disabled={uploading} />
              </label>

              {uploading && (
                <div className="mt-3 w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className="h-full bg-[#c8821a] rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                </div>
              )}

              {uploadError && (
                <div className="mt-3 flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {uploadError}
                  <button onClick={() => setUploadError("")} className="ml-auto"><X className="w-4 h-4" /></button>
                </div>
              )}
            </div>

          ) : (
            <div className="max-w-lg">
              <h2 className="font-semibold text-white mb-4">Assistant Configuration</h2>
              <p className="text-white/40 text-sm">Configure the AI assistant for this knowledge base in the Clara Backend admin panel.</p>
              <a href="http://localhost:3000/admin" target="_blank" rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-sm text-[#c8821a] border border-[#c8821a]/30 px-4 py-2 rounded-xl hover:bg-[#c8821a]/10 transition-colors">
                Open Clara Admin
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
