"use client";

/**
 * src/components/admin/email-templates/TemplateCodeEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Monaco (VS Code) editor specialised for email template HTML.
 *
 *   · `{{` triggers autocomplete listing every available variable with its
 *     description — picking one inserts `{{name}}`.
 *   · Ctrl/Cmd+S saves the draft (intercepted before the browser dialog).
 *   · Format button, word wrap, collapsible minimap and a focus/fullscreen
 *     mode that keeps the Monaco model (undo history) intact.
 * Monaco assets are self-hosted at /monaco/vs (no CDN, CSP-safe).
 */

import dynamic from "next/dynamic";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { loader } from "@monaco-editor/react";
import type { editor as MonacoEditorNamespace } from "monaco-editor";
import { Maximize2, Minimize2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TemplateVariable } from "./shared";

loader.config({ paths: { vs: "/monaco/vs" } });

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-sm text-slate-400">
      Loading editor…
    </div>
  ),
});

export type TemplateCodeEditorHandle = {
  insertVariable: (name: string) => void;
  focus: () => void;
};

type Props = {
  path: string;
  value: string;
  onChange: (value: string) => void;
  variables: TemplateVariable[];
  onSave?: () => void;
  height?: number;
};

export const TemplateCodeEditor = forwardRef<TemplateCodeEditorHandle, Props>(
  function TemplateCodeEditor({ path, value, onChange, variables, onSave, height = 440 }, ref) {
    const editorRef = useRef<MonacoEditorNamespace.IStandaloneCodeEditor | null>(null);
    const variablesRef = useRef(variables);
    const saveRef = useRef(onSave);
    const providerRef = useRef<{ dispose: () => void } | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [minimap, setMinimap] = useState(false);

    useEffect(() => { variablesRef.current = variables; }, [variables]);
    useEffect(() => { saveRef.current = onSave; }, [onSave]);

    const insertVariable = useCallback((name: string) => {
      const editor = editorRef.current;
      const insert = `{{${name}}}`;
      if (!editor) {
        onChange(`${value}${insert}`);
        return;
      }
      const sel = editor.getSelection();
      editor.executeEdits("variable-insert", [{
        range: sel ?? {
          startLineNumber: 1, startColumn: 1,
          endLineNumber: 1, endColumn: 1,
        },
        text: insert,
      }]);
      editor.focus();
    }, [onChange, value]);

    useImperativeHandle(ref, () => ({
      insertVariable,
      focus: () => editorRef.current?.focus(),
    }), [insertVariable]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleMount = useCallback((editor: MonacoEditorNamespace.IStandaloneCodeEditor, monaco: any) => {
      editorRef.current = editor;

      // Ctrl/Cmd+S → save draft (bypass the browser's save-page dialog).
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => saveRef.current?.(),
      );

      // `{{` autocompletes variables; hovering a {{placeholder}} shows docs.
      if (providerRef.current) providerRef.current.dispose();
      providerRef.current = monaco.languages.registerCompletionItemProvider("html", {
        triggerCharacters: ["{"],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        provideCompletionItems: (model: any, position: any) => {
          const word = model.getWordUntilPosition(position);
          const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
          // Only offer variables once the admin typed `{{` (or part of one).
          const inPlaceholder = /\{\{?\s*[a-zA-Z_]*$/.test(line);
          if (!inPlaceholder && !word.word) return { suggestions: [] };
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };
          return {
            suggestions: variablesRef.current.map((v) => ({
              label: `{{${v.name}}}`,
              kind: monaco.languages.CompletionItemKind.Variable,
              detail: "Template variable",
              documentation: v.description,
              insertText: `{{${v.name}}}`,
              range,
            })),
          };
        },
      });
    }, []);

    useEffect(() => () => {
      providerRef.current?.dispose();
      providerRef.current = null;
    }, []);

    // Esc exits focus mode.
    useEffect(() => {
      if (!expanded) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          const editorEl = document.activeElement;
          // Only exit when Monaco itself is not consuming Esc (e.g. closing
          // its own widgets) — a bare Esc outside the editor exits.
          if (!(editorEl instanceof HTMLElement) || !editorEl.closest(".monaco-editor")) {
            setExpanded(false);
          }
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [expanded]);

    const handleFormat = useCallback(() => {
      editorRef.current?.getAction("editor.action.formatDocument")?.run();
    }, []);

    return (
      <div
        className={
          expanded
            ? "fixed inset-0 z-[60] flex flex-col bg-background/95 backdrop-blur-sm p-3 sm:p-4"
            : "relative flex flex-col"
        }
      >
        {expanded && (
          <div className="mb-2 flex items-center justify-between">
            <span className="px-1 text-xs font-medium text-muted-foreground">
              HTML body — focus mode (Esc to exit)
            </span>
          </div>
        )}
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <MonacoEditor
            path={path}
            theme="vs-dark"
            language="html"
            value={value}
            onMount={handleMount}
            onChange={(next) => onChange(next ?? "")}
            height={expanded ? "78vh" : height}
            options={{
              automaticLayout: true,
              minimap: { enabled: minimap || expanded },
              scrollBeyondLastLine: false,
              wordWrap: "on",
              wrappingIndent: "indent",
              wrappingStrategy: "advanced",
              tabSize: 2,
              fontSize: 13,
              lineHeight: 20,
              folding: true,
              formatOnPaste: true,
              formatOnType: true,
              scrollbar: { vertical: "auto", horizontal: "hidden" },
              padding: { top: 14, bottom: 14 },
              smoothScrolling: true,
              cursorBlinking: "smooth",
              bracketPairColorization: { enabled: true },
              suggest: { showWords: false },
              quickSuggestions: { other: true, strings: true },
            }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 px-1">
          <span className="hidden text-[11px] text-muted-foreground/70 sm:block">
            Type <code className="rounded bg-muted px-1">{"{{"}</code> to autocomplete variables · Ctrl/Cmd+S saves the draft
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button" variant="outline" size="sm"
              onClick={handleFormat}
              className="h-8"
            >
              <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Format
            </Button>
            <Button
              type="button" variant="outline" size="sm"
              onClick={() => setMinimap((m) => !m)}
              className={`h-8 ${minimap ? "text-primary" : "text-muted-foreground"}`}
              title="Toggle minimap"
            >
              Map
            </Button>
            <Button
              type="button" variant="outline" size="sm"
              onClick={() => setExpanded((e) => !e)}
              className="h-8"
            >
              {expanded
                ? <><Minimize2 className="mr-1.5 h-3.5 w-3.5" /> Exit focus</>
                : <><Maximize2 className="mr-1.5 h-3.5 w-3.5" /> Focus</>}
            </Button>
          </div>
        </div>
        {expanded && (
          <button
            type="button"
            aria-label="Exit focus mode"
            onClick={() => setExpanded(false)}
            className="absolute right-4 top-3 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
          >
            Esc
          </button>
        )}
      </div>
    );
  },
);
