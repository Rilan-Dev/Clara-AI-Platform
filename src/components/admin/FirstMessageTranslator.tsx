"use client";
/**
 * FirstMessageTranslator — the language chip under the "First message"
 * editor. Opens a language menu (assistant languages first, then every
 * supported language, searchable); picking one translates the message the
 * admin typed, shows it for review, and replaces the first message only on
 * an explicit click. "Language settings" still opens the Language card.
 *
 * The agent always greets in its DEFAULT language, so when the translation
 * is in another language the admin can also make that language the default.
 */
import { useState } from "react";
import { ArrowLeft, ChevronDown, Languages, Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { LANGUAGE_OPTIONS, languageOption } from "./LanguagePicker";

export type TranslateText = (text: string, targetLanguage: string) => Promise<string>;

type Props = {
  text: string;
  defaultLanguage: string;
  allowedLanguages: string[];
  translate: TranslateText;
  onReplace: (translated: string, language: string, makeDefault: boolean) => void;
  onOpenSettings: () => void;
  disabled?: boolean;
};

function base(code: string): string {
  return code.toLowerCase().split(/[-_]/)[0] ?? code;
}

function label(code: string): string {
  return languageOption(code)?.label ?? languageOption(base(code))?.label ?? code;
}

function flag(code: string): string {
  return languageOption(code)?.flag ?? languageOption(base(code))?.flag ?? "🌐";
}

export function FirstMessageTranslator({
  text,
  defaultLanguage,
  allowedLanguages,
  translate,
  onReplace,
  onOpenSettings,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busyLanguage, setBusyLanguage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ language: string; text: string } | null>(null);

  const assistantCodes = [...new Set([defaultLanguage, ...allowedLanguages].filter(Boolean))];
  const assistantBases = new Set(assistantCodes.map(base));
  const others = LANGUAGE_OPTIONS.filter((l) => !assistantBases.has(base(l.code)));
  const hasText = text.trim().length > 0;

  const reset = () => {
    setResult(null);
    setError(null);
    setBusyLanguage(null);
  };

  const pick = async (code: string) => {
    if (!hasText || busyLanguage) return;
    setBusyLanguage(code);
    setError(null);
    try {
      const translated = await translate(text, code);
      setResult({ language: code, text: translated });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The translation could not be completed.");
    } finally {
      setBusyLanguage(null);
    }
  };

  const apply = (makeDefault: boolean) => {
    if (!result || !result.text.trim()) return;
    onReplace(result.text.trim(), result.language, makeDefault);
    setOpen(false);
    reset();
  };

  const isDefault = (code: string) => base(code) === base(defaultLanguage);

  const item = (code: string, name: string, extra?: string) => (
    <CommandItem
      key={code}
      value={`${code} ${name} ${extra ?? ""}`}
      disabled={!hasText || Boolean(busyLanguage)}
      onSelect={() => void pick(code)}
      className="flex items-center gap-2"
    >
      <span aria-hidden>{flag(code)}</span>
      <span className="flex-1 truncate">{name}</span>
      {isDefault(code) && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">Default</span>}
      {busyLanguage === code && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
          title="Translate the first message"
          aria-label={`First message language: ${label(defaultLanguage)}. Translate the first message`}
        >
          <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-muted/40 text-[11px]">
            {flag(defaultLanguage)}
          </span>
          {label(defaultLanguage)}
          <ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        {!result ? (
          <>
            <div className="border-b border-border px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Languages className="h-3.5 w-3.5 text-primary" /> Translate first message
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {hasText
                  ? `The agent greets visitors in ${label(defaultLanguage)}. Pick a language to translate the message into.`
                  : "Write a first message above, then pick a language to translate it."}
              </p>
            </div>
            <Command>
              <CommandInput placeholder="Search languages…" />
              <CommandList className="max-h-64">
                <CommandEmpty>No language found.</CommandEmpty>
                <CommandGroup heading="Assistant languages">
                  {assistantCodes.map((code) => item(code, label(code), languageOption(code)?.native))}
                </CommandGroup>
                <CommandGroup heading="All languages">
                  {others.map((l) => item(l.code, l.label, l.native))}
                </CommandGroup>
              </CommandList>
            </Command>
            {error && (
              <p role="alert" className="border-t border-border px-3 py-2 text-xs text-destructive">{error}</p>
            )}
            <button
              type="button"
              onClick={() => { setOpen(false); onOpenSettings(); }}
              className="flex w-full items-center gap-1.5 border-t border-border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Settings2 className="h-3.5 w-3.5" /> Language settings
            </button>
          </>
        ) : (
          <div className="space-y-2.5 p-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setResult(null)}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Back to languages"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <p className="text-sm font-medium text-foreground">
                <span aria-hidden>{flag(result.language)}</span> {label(result.language)}
              </p>
            </div>
            <Textarea
              aria-label={`First message in ${label(result.language)}`}
              lang={result.language}
              value={result.text}
              onChange={(e) => setResult({ ...result, text: e.target.value })}
              rows={4}
              className="text-sm"
            />
            {!isDefault(result.language) && (
              <p className="text-[11px] text-muted-foreground">
                The agent greets in its default language ({label(defaultLanguage)}). To greet in {label(result.language)},
                also make it the default.
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              {!isDefault(result.language) && (
                <Button size="sm" onClick={() => apply(true)} disabled={!result.text.trim()}>
                  Replace &amp; make {label(result.language)} default
                </Button>
              )}
              <Button
                size="sm"
                variant={isDefault(result.language) ? "default" : "outline"}
                onClick={() => apply(false)}
                disabled={!result.text.trim()}
              >
                Replace first message
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
