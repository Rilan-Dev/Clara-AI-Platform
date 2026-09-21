"use client";
import { useMemo, useState } from "react";
import { MessageSquare, Mic } from "lucide-react";
import { useSearchParams } from "next/navigation";
type Mode = "chat" | "voice";
export default function EmbedPreviewScreen() {
  const searchParams = useSearchParams();
  const apiKey = searchParams.get("key")?.trim() ?? "";
  const initialMode = searchParams.get("mode") === "voice" ? "voice" : "chat";
  const [mode, setMode] = useState<Mode>(initialMode);
  const src = useMemo(() => {
    if (!apiKey) return "";
    const path = mode === "voice" ? "/embed/voice" : "/embed/widget";
    return `${path}?key=${encodeURIComponent(apiKey)}`;
  }, [apiKey, mode]);
  if (!apiKey) return <div className="min-h-screen flex items-center justify-center bg-background text-sm text-destructive">No API key provided.</div>;
  return (
    <main className="min-h-screen bg-background p-3 sm:p-5">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-lg">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-6">
          <div><p className="text-sm font-semibold text-foreground">Clara AI Preview</p><p className="text-xs text-muted-foreground">One published assistant · Chat and Voice</p></div>
          <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1" role="tablist" aria-label="Preview mode">
            <button type="button" role="tab" aria-selected={mode === "chat"} onClick={() => setMode("chat")} className={"inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors " + (mode === "chat" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}><MessageSquare className="h-3.5 w-3.5" /> Chat</button>
            <button type="button" role="tab" aria-selected={mode === "voice"} onClick={() => setMode("voice")} className={"inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors " + (mode === "voice" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}><Mic className="h-3.5 w-3.5" /> Voice</button>
          </div>
        </header>
        <div className="min-h-0 flex-1"><iframe key={mode} title={"Clara AI " + mode + " preview"} src={src} className="block h-[calc(100vh-7rem)] min-h-[680px] w-full border-0" allow="microphone; autoplay" referrerPolicy="strict-origin-when-cross-origin" /></div>
      </div>
    </main>
  );
}