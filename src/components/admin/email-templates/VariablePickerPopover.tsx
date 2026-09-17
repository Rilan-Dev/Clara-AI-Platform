"use client";

/**
 * src/components/admin/email-templates/VariablePickerPopover.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Searchable, category-grouped variable picker. Clicking a variable inserts
 * `{{name}}` at the editor cursor — no flat wall of chips in the main UI.
 */

import { useMemo, useState } from "react";
import { Braces, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CATEGORY_LABELS, VARIABLE_CATEGORY_ORDER, type ManagedVariable } from "./shared";

type Props = {
  variables: ManagedVariable[];
  onInsert: (name: string) => void;
};

export function VariablePickerPopover({ variables, onInsert }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const grouped = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const map = new Map<string, ManagedVariable[]>();
    for (const cat of VARIABLE_CATEGORY_ORDER) {
      const items = variables.filter(
        (v) =>
          v.category === cat &&
          (!needle ||
            v.name.toLowerCase().includes(needle) ||
            v.description.toLowerCase().includes(needle)),
      );
      if (items.length) map.set(cat, items);
    }
    return map;
  }, [variables, q]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-indigo-200 transition-colors hover:border-indigo-500/40 hover:bg-indigo-500/10"
        >
          <Braces className="h-3.5 w-3.5" />
          Insert variable
          <span className="rounded-full bg-indigo-500/20 px-1.5 text-[10px] text-indigo-300">
            {variables.length}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 border-white/10 bg-[#12131f] p-0 text-white"
      >
        <div className="border-b border-white/[0.06] p-2">
          <div className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-white/30" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search variables…"
              className="w-full bg-transparent text-xs text-white placeholder:text-white/25 focus:outline-none"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          {[...grouped.entries()].map(([cat, items]) => (
            <div key={cat} className="mb-1.5">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">
                {CATEGORY_LABELS[cat] ?? cat}
              </p>
              {items.map((v) => (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => { onInsert(v.name); setOpen(false); }}
                  title={v.description}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-indigo-500/10"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-xs text-indigo-200">
                      {`{{${v.name}}}`}
                    </span>
                    <span className="block truncate text-[11px] text-white/40">
                      {v.isSystem ? v.description : `${v.description || "Custom variable"} — “${v.value}”`}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ))}
          {grouped.size === 0 && (
            <p className="px-3 py-6 text-center text-xs text-white/30">No variables match “{q}”.</p>
          )}
        </div>
        <p className="border-t border-white/[0.06] px-3 py-2 text-[10px] text-white/30">
          System values come from the platform; custom values are inserted as saved.
        </p>
      </PopoverContent>
    </Popover>
  );
}
