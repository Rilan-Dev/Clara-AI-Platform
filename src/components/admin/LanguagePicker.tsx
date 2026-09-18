"use client";
/**
 * LanguagePicker — goal-oriented language selection (ElevenLabs-style).
 *
 * Design principles:
 *  - "Don't make me think": one obvious choice surface (search + popular),
 *    never a 56-button wall.
 *  - Progressive disclosure: popular languages first, everything else via
 *    instant search (matches English label, native name, and ISO code).
 *  - Recognition over recall: flag + English label + native name subtitle.
 *  - Safe by construction: multi-select always keeps at least one language.
 */

import * as React from "react";
import { Check, ChevronsUpDown, Languages, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { SUPPORTED_LANGUAGES } from "@/modules/assistant/core/config";

/* ── Language presentation metadata (UI-only enrichment) ──────────────────── */

const LANGUAGE_META: Record<string, { native: string; flag: string }> = {
  af: { native: "Afrikaans", flag: "🇿🇦" },
  ar: { native: "العربية", flag: "🇸🇦" },
  hy: { native: "Հայերեն", flag: "🇦🇲" },
  az: { native: "Azərbaycan", flag: "🇦🇿" },
  be: { native: "Беларуская", flag: "🇧🇾" },
  bn: { native: "বাংলা", flag: "🇧🇩" },
  bs: { native: "Bosanski", flag: "🇧🇦" },
  bg: { native: "Български", flag: "🇧🇬" },
  my: { native: "မြန်မာ", flag: "🇲🇲" },
  ca: { native: "Català", flag: "🇪🇸" },
  zh: { native: "中文", flag: "🇨🇳" },
  hr: { native: "Hrvatski", flag: "🇭🇷" },
  cs: { native: "Čeština", flag: "🇨🇿" },
  da: { native: "Dansk", flag: "🇩🇰" },
  nl: { native: "Nederlands", flag: "🇳🇱" },
  en: { native: "English", flag: "🇬🇧" },
  et: { native: "Eesti", flag: "🇪🇪" },
  fi: { native: "Suomi", flag: "🇫🇮" },
  fr: { native: "Français", flag: "🇫🇷" },
  gl: { native: "Galego", flag: "🇪🇸" },
  ka: { native: "ქართული", flag: "🇬🇪" },
  de: { native: "Deutsch", flag: "🇩🇪" },
  el: { native: "Ελληνικά", flag: "🇬🇷" },
  gu: { native: "ગુજરાતી", flag: "🇮🇳" },
  he: { native: "עברית", flag: "🇮🇱" },
  hi: { native: "हिन्दी", flag: "🇮🇳" },
  hu: { native: "Magyar", flag: "🇭🇺" },
  is: { native: "Íslenska", flag: "🇮🇸" },
  id: { native: "Bahasa Indonesia", flag: "🇮🇩" },
  it: { native: "Italiano", flag: "🇮🇹" },
  ja: { native: "日本語", flag: "🇯🇵" },
  kn: { native: "ಕನ್ನಡ", flag: "🇮🇳" },
  kk: { native: "Қазақша", flag: "🇰🇿" },
  km: { native: "ខ្មែរ", flag: "🇰🇭" },
  ko: { native: "한국어", flag: "🇰🇷" },
  lo: { native: "ລາວ", flag: "🇱🇦" },
  lv: { native: "Latviešu", flag: "🇱🇻" },
  lt: { native: "Lietuvių", flag: "🇱🇹" },
  mk: { native: "Македонски", flag: "🇲🇰" },
  ml: { native: "മലയാളം", flag: "🇮🇳" },
  ms: { native: "Bahasa Melayu", flag: "🇲🇾" },
  mr: { native: "मराठी", flag: "🇮🇳" },
  ne: { native: "नेपाली", flag: "🇳🇵" },
  no: { native: "Norsk", flag: "🇳🇴" },
  fa: { native: "فارسی", flag: "🇮🇷" },
  pl: { native: "Polski", flag: "🇵🇱" },
  pt: { native: "Português", flag: "🇵🇹" },
  pa: { native: "ਪੰਜਾਬੀ", flag: "🇮🇳" },
  ro: { native: "Română", flag: "🇷🇴" },
  ru: { native: "Русский", flag: "🇷🇺" },
  sr: { native: "Српски", flag: "🇷🇸" },
  si: { native: "සිංහල", flag: "🇱🇰" },
  sk: { native: "Slovenčina", flag: "🇸🇰" },
  sl: { native: "Slovenščina", flag: "🇸🇮" },
  es: { native: "Español", flag: "🇪🇸" },
  sw: { native: "Kiswahili", flag: "🇰🇪" },
  sv: { native: "Svenska", flag: "🇸🇪" },
  tl: { native: "Tagalog", flag: "🇵🇭" },
  te: { native: "తెలుగు", flag: "🇮🇳" },
  ta: { native: "தமிழ்", flag: "🇮🇳" },
  th: { native: "ไทย", flag: "🇹🇭" },
  tr: { native: "Türkçe", flag: "🇹🇷" },
  uk: { native: "Українська", flag: "🇺🇦" },
  ur: { native: "اردو", flag: "🇵🇰" },
  vi: { native: "Tiếng Việt", flag: "🇻🇳" },
  cy: { native: "Cymraeg", flag: "🏴󠁧󠁢󠁷󠁬󠁳󠁿" },
};

/** Curated by global reach so the first screen covers most users' goal. */
const POPULAR_CODES = ["en", "es", "zh", "hi", "fr", "de", "pt", "ar", "ja", "ru", "ko", "it"] as const;

export type LanguageOption = {
  code: string;
  label: string;
  native: string;
  flag: string;
  popular: boolean;
};

export const LANGUAGE_OPTIONS: LanguageOption[] = SUPPORTED_LANGUAGES.map((l) => ({
  code: l.code,
  label: l.label,
  native: LANGUAGE_META[l.code]?.native ?? l.label,
  flag: LANGUAGE_META[l.code]?.flag ?? "🌐",
  popular: (POPULAR_CODES as readonly string[]).includes(l.code),
}));

export function languageOption(code: string): LanguageOption | undefined {
  return LANGUAGE_OPTIONS.find((l) => l.code === code);
}

function languageLabel(code: string): string {
  return languageOption(code)?.label ?? code;
}

/* ── Shared menu body ─────────────────────────────────────────────────────── */

function LanguageMenu({
  selected,
  onToggle,
  single,
  autoOption,
}: {
  selected: string[];
  onToggle: (code: string) => void;
  single?: boolean;
  autoOption?: { label: string; description: string; selected: boolean; onChoose: () => void };
}) {
  const [query, setQuery] = React.useState("");

  const normalise = (value: string) => value.trim().toLowerCase();
  const matches = (option: LanguageOption) => {
    const q = normalise(query);
    if (!q) return true;
    return (
      option.label.toLowerCase().includes(q) ||
      option.native.toLowerCase().includes(q) ||
      option.code.toLowerCase().includes(q)
    );
  };

  const filtered = LANGUAGE_OPTIONS.filter(matches);
  const popular = filtered.filter((l) => l.popular);
  const others = filtered.filter((l) => !l.popular);

  const renderItem = (option: LanguageOption) => {
    const isSelected = selected.includes(option.code);
    return (
      <CommandItem
        key={option.code}
        value={`${option.label} ${option.native} ${option.code}`}
        onSelect={() => onToggle(option.code)}
        className="gap-3"
      >
        <span aria-hidden className="text-base leading-none">{option.flag}</span>
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="truncate text-sm font-medium">{option.label}</span>
          <span className="truncate text-xs text-muted-foreground">{option.native}</span>
        </span>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
          {option.code}
        </span>
        {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
      </CommandItem>
    );
  };

  return (
    <Command shouldFilter={false} className="rounded-lg">
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search language or code…"
        className="border-b border-border"
      />
      <CommandList className="max-h-72">
        <CommandEmpty>No language matches your search.</CommandEmpty>
        {autoOption && (
          <CommandGroup heading="Default behaviour">
            <CommandItem value={autoOption.label} onSelect={autoOption.onChoose} className="gap-3">
              <Languages className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">{autoOption.label}</span>
                <span className="text-xs text-muted-foreground">{autoOption.description}</span>
              </span>
              {autoOption.selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </CommandItem>
          </CommandGroup>
        )}
        {popular.length > 0 && <CommandGroup heading={single ? "Popular" : "Popular languages"}>{popular.map(renderItem)}</CommandGroup>}
        {others.length > 0 && (
          <CommandGroup heading={single ? "All languages" : "All languages — search to narrow"}>
            {others.map(renderItem)}
          </CommandGroup>
        )}
      </CommandList>
      <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        {single ? "Most-used languages are one click away." : `${selected.length} selected · the primary language is always enabled.`}
      </p>
    </Command>
  );
}

/* ── Single-select ────────────────────────────────────────────────────────── */

export function LanguageSelect({
  value,
  onChange,
  placeholder = "Select language…",
  autoLabel,
  autoDescription,
}: {
  value: string | null;
  onChange: (code: string | null) => void;
  placeholder?: string;
  /** When set, an "Auto" option is offered that resolves to null. */
  autoLabel?: string;
  autoDescription?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const option = value ? languageOption(value) : undefined;
  const hasAuto = Boolean(autoLabel);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-10 w-full max-w-sm justify-between font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            {option ? (
              <>
                <span aria-hidden className="text-base leading-none">{option.flag}</span>
                <span className="truncate text-sm font-medium text-foreground">{option.label}</span>
                <span className="truncate text-xs text-muted-foreground">{option.native}</span>
              </>
            ) : hasAuto ? (
              <>
                <Languages className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="truncate text-sm font-medium text-foreground">{autoLabel}</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <LanguageMenu
          single
          selected={value ? [value] : []}
          onToggle={(code) => {
            onChange(code);
            setOpen(false);
          }}
          autoOption={
            hasAuto
              ? {
                  label: autoLabel!,
                  description: autoDescription ?? "",
                  selected: !value,
                  onChoose: () => {
                    onChange(null);
                    setOpen(false);
                  },
                }
              : undefined
          }
        />
      </PopoverContent>
    </Popover>
  );
}

/* ── Multi-select ─────────────────────────────────────────────────────────── */

export function LanguageMultiSelect({
  value,
  onChange,
  onBlockedMinimum,
}: {
  value: string[];
  onChange: (codes: string[]) => void;
  /** Called when removal would empty the set — lets the parent explain the rule. */
  onBlockedMinimum?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = value.map((code) => languageOption(code) ?? { code, label: languageLabel(code), native: "", flag: "🌐", popular: false });

  const toggle = (code: string) => {
    if (value.includes(code)) {
      if (value.length <= 1) {
        onBlockedMinimum?.();
        return;
      }
      onChange(value.filter((c) => c !== code));
    } else {
      onChange([...value, code]);
    }
  };

  const selectPopular = () => {
    const next = Array.from(new Set([...value, ...POPULAR_CODES]));
    onChange(next);
    setOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={open} size="sm" className="h-9 gap-2">
              <Plus className="h-4 w-4" aria-hidden />
              Add language
              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0">
            <LanguageMenu selected={value} onToggle={toggle} />
          </PopoverContent>
        </Popover>
        <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground" onClick={selectPopular}>
          Add popular 12
        </Button>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2" role="list" aria-label="Enabled languages">
          {selected.map((option) => (
            <span
              key={option.code}
              role="listitem"
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 py-1 pl-2.5 pr-1.5 text-sm text-foreground"
            >
              <span aria-hidden className="text-sm leading-none">{option.flag}</span>
              {option.label}
              <button
                type="button"
                aria-label={`Remove ${option.label}`}
                onClick={() => toggle(option.code)}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-primary/20 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
