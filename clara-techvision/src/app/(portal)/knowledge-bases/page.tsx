"use client";
import { useEffect, useState } from "react";
import { Database, Upload, Plus, FileText, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import {
  getKbsForOrg, getDocuments, uploadDocument,
  type KnowledgeBase, type Document,
} from "@/lib/api";
import { isApiError } from "@/lib/http";

const ORG_ID = import.meta.env.VITE_ORG_ID ?? "";

export default function TVKnowledgeBases() {
  const [kbs, setKbs]       = useState<KnowledgeBase[]>([]);
  const [selected, setSelected] = useState("");
  const [docs, setDocs]     = useState<Document[]>([]);
  const [uploading, setUploading]         = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError]     = useState("");
  const [loading, setLoading]             = useState(true);

  useEffect(() => {
    getKbsForOrg(ORG_ID)
      .then(d => { setKbs(d); if (d.length > 0) setSelected(d[0].id); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selected) getDocuments(selected).then(setDocs).catch(() => {});
  }, [selected]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    setUploading(true);
    setUploadError("");
    setUploadProgress(0);

    try {
      await uploadDocument(selected, file, setUploadProgress);
      setDocs(await getDocuments(selected));
    } catch (err: unknown) {
      setUploadError(isApiError(err) ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      e.target.value = "";
    }
  }

  const selectedKb = kbs.find(k => k.id === selected);

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-64 bg-[#0c1929] border-r border-white/[0.05] flex flex-col">
        <div className="px-4 py-4 border-b border-white/[0.05] flex items-center justify-between">
          <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">KBs ({kbs.length}/3)</span>
          <button className="w-6 h-6 rounded-md bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 flex items-center justify-center transition-colors">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 p-3 space-y-1">
          {loading && <p className="text-xs text-white/30 px-2">Loading…</p>}
          {kbs.map(kb => (
            <button key={kb.id} onClick={() => setSelected(kb.id)}
              className={`w-full text-left px-3 py-3 rounded-xl text-sm transition-all ${
                selected === kb.id
                  ? "bg-sky-500/10 text-white border border-sky-500/20"
                  : "text-white/50 hover:text-white hover:bg-white/[0.04]"
              }`}>
              <div className="font-medium truncate">{kb.name}</div>
              <div className="text-xs text-white/30 mt-0.5">{kb.docCount} docs</div>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-14 px-6 flex items-center justify-between border-b border-white/[0.05] bg-[#0c1929]/40 shrink-0">
          <div className="flex items-center gap-3">
            <Database className="w-4 h-4 text-sky-400" />
            <span className="font-semibold text-white">{selectedKb?.name ?? "Select a KB"}</span>
          </div>
          {selectedKb && (
            <label className={`flex items-center gap-2 cursor-pointer border px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              uploading
                ? "bg-sky-500/20 text-sky-300 border-sky-500/30 cursor-wait"
                : "bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border-sky-500/20"
            }`}>
              <Upload className="w-3.5 h-3.5" />
              {uploading ? `Uploading… ${uploadProgress}%` : "Upload"}
              <input type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {uploading && (
            <div className="mb-4 w-full h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
              <div className="h-full bg-sky-500 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}

          {uploadError && (
            <div className="mb-4 flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" /> {uploadError}
            </div>
          )}

          {docs.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-white/[0.06] rounded-2xl">
              <FileText className="w-10 h-10 text-white/20 mx-auto mb-3" />
              <p className="text-white/40 text-sm">No documents yet. Upload to start.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {docs.map(doc => (
                <div key={doc.id} className="flex items-center gap-4 px-4 py-3 border border-white/[0.05] bg-white/[0.02] rounded-xl hover:bg-white/[0.04] transition-colors">
                  <FileText className="w-4 h-4 text-sky-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{doc.title || doc.originalFilename}</div>
                    <div className="text-xs text-white/30">{doc.chunkCount} chunks · {(doc.fileSize / 1024).toFixed(0)}KB</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {doc.status === "ready"      && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                    {doc.status === "processing" && <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin" />}
                    {doc.status === "failed"     && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                    <span className={`text-xs ${doc.status === "ready" ? "text-emerald-400" : doc.status === "failed" ? "text-red-400" : "text-amber-400"}`}>
                      {doc.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
