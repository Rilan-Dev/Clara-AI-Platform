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
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/10"
        >
          <Braces className="h-3.5 w-3.5" />
          Insert variable
          <span className="rounded-full bg-primary/15 px-1.5 text-[11px] text-primary">
            {variables.length}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 p-0"
      >
        <div className="border-b border-border/70 p-2">
          <div className="flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search variables…"
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/80 focus:outline-none"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          {[...grouped.entries()].map(([cat, items]) => (
            <div key={cat} className="mb-1.5">
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {CATEGORY_LABELS[cat] ?? cat}
              </p>
              {items.map((v) => (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => { onInsert(v.name); setOpen(false); }}
                  title={v.description}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-primary/10"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-xs text-primary">
                      {`{{${v.name}}}`}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {v.isSystem ? v.description : `${v.description || "Custom variable"} — “${v.value}”`}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ))}
          {grouped.size === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground/70">No variables match “{q}”.</p>
          )}
        </div>
        <p className="border-t border-border/70 px-3 py-2 text-[11px] text-muted-foreground/70">
          System values come from the platform; custom values are inserted as saved.
        </p>
      </PopoverContent>
    </Popover>
  );
}
