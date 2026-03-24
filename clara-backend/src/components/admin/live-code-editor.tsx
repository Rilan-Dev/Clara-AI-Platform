"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Maximize2, Minimize2, Wand2 } from "lucide-react";
import type { editor as MonacoEditorNamespace } from "monaco-editor";
import { Button } from "@/components/ui/button";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[220px] items-center justify-center rounded-xl border border-white/10 bg-[#0f1220] text-sm text-white/40">
      Loading editor…
    </div>
  ),
});

type LiveCodeEditorProps = {
  title: string;
  description?: string;
  language: "css" | "html" | "json";
  value: string;
  onChange: (value: string) => void;
  path: string;
  height?: number;
  schema?: Record<string, unknown>;
  minimap?: boolean;
};

function markerTone(markers: MonacoEditorNamespace.IMarker[]) {
  const errors = markers.filter((marker) => marker.severity === 8).length;
  const warnings = markers.filter((marker) => marker.severity === 4).length;

  if (errors > 0) {
    return {
      label: `${errors} error${errors > 1 ? "s" : ""}${warnings > 0 ? ` · ${warnings} warning${warnings > 1 ? "s" : ""}` : ""}`,
      className: "border-rose-500/30 bg-rose-500/10 text-rose-300",
      icon: AlertTriangle,
    };
  }

  if (warnings > 0) {
    return {
      label: `${warnings} warning${warnings > 1 ? "s" : ""}`,
      className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      icon: AlertTriangle,
    };
  }

  return {
    label: "No issues",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    icon: CheckCircle2,
  };
}

export function LiveCodeEditor({
  title,
  description,
  language,
  value,
  onChange,
  path,
  height = 220,
  schema,
  minimap = false,
}: LiveCodeEditorProps) {
  const editorRef = useRef<MonacoEditorNamespace.IStandaloneCodeEditor | null>(null);
  const [markers, setMarkers] = useState<MonacoEditorNamespace.IMarker[]>([]);
  const [expanded, setExpanded] = useState(false);

  const schemaUri = useMemo(() => `inmemory://schema/${path.replace(/[^a-z0-9]/gi, "-")}.json`, [path]);
  const tone = markerTone(markers);
  const StatusIcon = tone.icon;

  const beforeMount = useCallback((monaco: typeof import("monaco-editor")) => {
    if (language === "json" && schema) {
      monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
        validate: true,
        allowComments: false,
        enableSchemaRequest: false,
        schemas: [
          {
            uri: schemaUri,
            fileMatch: [path],
            schema,
          },
        ],
      });
    }
  }, [language, path, schema, schemaUri]);

  const handleMount = useCallback((editor: MonacoEditorNamespace.IStandaloneCodeEditor) => {
    editorRef.current = editor;
  }, []);

  const handleFormat = useCallback(() => {
    editorRef.current?.getAction("editor.action.formatDocument")?.run();
  }, []);

  const firstMarker = markers[0];

  return (
    <div className="space-y-2 rounded-2xl border border-white/[0.08] bg-[#0b1020] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-white">{title}</div>
          {description ? <p className="text-xs text-white/45">{description}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${tone.className}`}>
            <StatusIcon className="h-3.5 w-3.5" />
            <span>{tone.label}</span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleFormat} className="h-8 border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06] hover:text-white">
            <Wand2 className="mr-1.5 h-3.5 w-3.5" />
            Format
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setExpanded((current) => !current)} className="h-8 border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06] hover:text-white">
            {expanded ? <Minimize2 className="mr-1.5 h-3.5 w-3.5" /> : <Maximize2 className="mr-1.5 h-3.5 w-3.5" />}
            {expanded ? "Collapse" : "Expand"}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#111827]">
        <MonacoEditor
          path={path}
          theme="vs-dark"
          language={language}
          value={value}
          beforeMount={beforeMount}
          onMount={handleMount}
          onChange={(nextValue) => onChange(nextValue ?? "")}
          onValidate={(nextMarkers) => setMarkers(nextMarkers)}
          height={expanded ? 420 : height}
          options={{
            automaticLayout: true,
            minimap: { enabled: minimap || expanded },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            tabSize: 2,
            fontSize: 13,
            lineHeight: 20,
            folding: true,
            formatOnPaste: true,
            formatOnType: true,
            padding: { top: 14, bottom: 14 },
            smoothScrolling: true,
            cursorBlinking: "smooth",
            bracketPairColorization: { enabled: true },
            suggest: { showWords: true },
          }}
        />
      </div>

      {firstMarker ? (
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/60">
          <span className="font-medium text-white/80">Line {firstMarker.startLineNumber}, Col {firstMarker.startColumn}:</span>{" "}
          {firstMarker.message}
        </div>
      ) : null}
    </div>
  );
}
