"use client";

/**
 * Knowledge-base tab bar — an accessible tablist (roving focus, arrow keys,
 * Home/End) shared by the embedded and standalone KB screens.
 */

import { useRef } from "react";

export const KB_TABS = [
  { id: "documents", label: "Documents" },
  { id: "scrape", label: "Scrape" },
  { id: "analytics", label: "Analytics" },
  { id: "deploy", label: "Embed & API keys" },
  { id: "design", label: "Widget design" },
  { id: "phone", label: "Phone" },
] as const;

export type KbTab = (typeof KB_TABS)[number]["id"];

export function isKbTab(value: string | null): value is KbTab {
  return KB_TABS.some((t) => t.id === value);
}

export function KbTabBar({ value, onChange, embeddableWidgetEnabled = true }: {
  value: KbTab;
  onChange: (tab: KbTab) => void;
  embeddableWidgetEnabled?: boolean;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const visibleTabs = embeddableWidgetEnabled
    ? KB_TABS
    : KB_TABS.filter((tab) => tab.id !== "deploy" && tab.id !== "design");

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const last = visibleTabs.length - 1;
    const next =
      e.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : e.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(visibleTabs[next].id);
  }

  return (
    <div
      role="tablist"
      aria-label="Knowledge base sections"
      className="flex gap-1 rounded-xl bg-muted/50 p-1 border border-border w-fit max-w-full overflow-x-auto scrollbar-none rail-fade-r md:[mask-image:none] md:[-webkit-mask-image:none]"
    >
      {visibleTabs.map((item, index) => {
        const selected = value === item.id;
        return (
          <button
            key={item.id}
            ref={(el) => { refs.current[index] = el; }}
            type="button"
            role="tab"
            id={`kb-tab-${item.id}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              selected ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:text-foreground border border-transparent"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
