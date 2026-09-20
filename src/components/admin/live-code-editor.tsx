"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Maximize2, Minimize2, Wand2 } from "lucide-react";
import { loader } from "@monaco-editor/react";
import type { editor as MonacoEditorNamespace } from "monaco-editor";
import { Button } from "@/components/ui/button";

const registeredTypeLibs = new Set<string>();

loader.config({
  paths: {
    vs: "/monaco/vs",
  },
});

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[220px] items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-sm text-slate-400">
      Loading editor…
    </div>
  ),
});

type LiveCodeEditorProps = {
  title: string;
  description?: string;
  language: "css" | "html" | "json" | "typescript";
  value: string;
  onChange: (value: string) => void;
  path: string;
  height?: number;
  schema?: Record<string, unknown>;
  minimap?: boolean;
  typescriptExtraLibs?: Array<{ filePath: string; content: string }>;
};

function markerTone(markers: MonacoEditorNamespace.IMarker[]) {
  const errors = markers.filter((marker) => marker.severity === 8).length;
  const warnings = markers.filter((marker) => marker.severity === 4).length;

  if (errors > 0) {
    return {
      label: `${errors} error${errors > 1 ? "s" : ""}${warnings > 0 ? ` · ${warnings} warning${warnings > 1 ? "s" : ""}` : ""}`,
      className: "border-destructive/30 bg-destructive/10 text-destructive",
      icon: AlertTriangle,
    };
  }

  if (warnings > 0) {
    return {
      label: `${warnings} warning${warnings > 1 ? "s" : ""}`,
      className: "border-amber-500/30 bg-amber-500/10 text-amber-600",
      icon: AlertTriangle,
    };
  }

  return {
    label: "No issues",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
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
  typescriptExtraLibs,
}: LiveCodeEditorProps) {
  const editorRef = useRef<MonacoEditorNamespace.IStandaloneCodeEditor | null>(null);
  const [markers, setMarkers] = useState<MonacoEditorNamespace.IMarker[]>([]);
  const [expanded, setExpanded] = useState(false);

  const schemaUri = useMemo(() => `inmemory://schema/${path.replace(/[^a-z0-9]/gi, "-")}.json`, [path]);
  const tone = markerTone(markers);
  const StatusIcon = tone.icon;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const beforeMount = useCallback((monaco: any) => {
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

    if (language === "typescript") {
      monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.ES2020,
        module: monaco.languages.typescript.ModuleKind.ESNext,
        allowNonTsExtensions: true,
        strict: true,
        noEmit: true,
      });
      monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
      });

      for (const lib of typescriptExtraLibs ?? []) {
        if (!registeredTypeLibs.has(lib.filePath)) {
          monaco.languages.typescript.typescriptDefaults.addExtraLib(lib.content, lib.filePath);
          registeredTypeLibs.add(lib.filePath);
        }
      }
    }
  }, [language, path, schema, schemaUri, typescriptExtraLibs]);

  const handleMount = useCallback((editor: MonacoEditorNamespace.IStandaloneCodeEditor) => {
    editorRef.current = editor;
  }, []);

  const handleFormat = useCallback(() => {
    editorRef.current?.getAction("editor.action.formatDocument")?.run();
  }, []);

  const firstMarker = markers[0];

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-foreground">{title}</div>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${tone.className}`}>
            <StatusIcon className="h-3.5 w-3.5" />
            <span>{tone.label}</span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleFormat} className="h-8">
            <Wand2 className="mr-1.5 h-3.5 w-3.5" />
            Format
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setExpanded((current) => !current)} className="h-8">
            {expanded ? <Minimize2 className="mr-1.5 h-3.5 w-3.5" /> : <Maximize2 className="mr-1.5 h-3.5 w-3.5" />}
            {expanded ? "Collapse" : "Expand"}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
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
            wrappingIndent: "indent",
            wordWrapColumn: 80,
            wrappingStrategy: "advanced",
            tabSize: 2,
            fontSize: 13,
            lineHeight: 20,
            folding: true,
            formatOnPaste: true,
            formatOnType: true,
            scrollbar: { horizontal: "hidden" },
            padding: { top: 14, bottom: 14 },
            smoothScrolling: true,
            cursorBlinking: "smooth",
            bracketPairColorization: { enabled: true },
            suggest: { showWords: true },
          }}
        />
      </div>

      {firstMarker ? (
        <div className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">Line {firstMarker.startLineNumber}, Col {firstMarker.startColumn}:</span>{" "}
          {firstMarker.message}
        </div>
      ) : null}
    </div>
  );
}
