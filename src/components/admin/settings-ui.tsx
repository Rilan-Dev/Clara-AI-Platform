"use client";

/**
 * src/components/admin/settings-ui.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared design kit for the settings editors ("the AI Providers & Models
 * design language").
 *
 * OrgAIConfigEditor (Organisation → Settings → AI Providers & Models) is the
 * reference UX: sectioned card, selectable provider cards, model dropdowns
 * with pricing metadata, friendly toggles and one Save bar. The other settings
 * surfaces (PlatformAssistantDefaultsEditor, PlatformEnvPanel) now reuse these
 * primitives so every configuration screen in the admin console looks,
 * feels and behaves the same.
 *
 * Everything here is presentational — no data fetching, no business rules.
 */

import { useState, type ReactNode } from "react";
import { Eye, EyeOff, AlertCircle, Check, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Section heading ─────────────────────────────────────────────────────────

/** The "icon + title (+ description)" heading that opens every settings section. */
export function SettingsSection({
  icon, title, description, children, className = "space-y-4",
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div>
        <div className="flex items-center gap-2">
          {icon && <span className="text-primary [&>svg]:w-4 [&>svg]:h-4">{icon}</span>}
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

// ─── Selectable option card (providers, gateways…) ───────────────────────────

export type OptionCardOption = {
  id: string;
  label: string;
  blurb?: string;
  /** Optional extra badge shown next to the label (e.g. "Platform key missing"). */
  badge?: { text: string; variant?: "default" | "secondary" | "destructive" | "outline" };
};

/** Grid of tappable cards — one active option, like the brain/voice provider pickers. */
export function OptionCardGrid({
  options, value, onChange, columns = 2, allowDeselect = false,
}: {
  options: OptionCardOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  columns?: 2 | 3;
  allowDeselect?: boolean;
}) {
  return (
    <div className={`grid gap-3 ${columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(selected && allowDeselect ? null : option.id)}
            className={`rounded-xl border p-4 text-left transition-colors ${
              selected
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:border-primary/40"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-foreground">{option.label}</span>
              {selected && <Badge variant="default" className="text-[10px]">Active</Badge>}
              {!selected && option.badge && (
                <Badge variant={option.badge.variant ?? "secondary"} className="text-[10px]">
                  {option.badge.text}
                </Badge>
              )}
            </div>
            {option.blurb && <p className="mt-1 text-xs text-muted-foreground">{option.blurb}</p>}
          </button>
        );
      })}
    </div>
  );
}

// ─── Model / option dropdown ─────────────────────────────────────────────────

export type SelectOption = { value: string; label: string; meta?: string };

/** Label + dropdown + hint. Options may carry metadata (price, dimensions…).
 *
 * Defence in depth: options with an empty-string value are dropped before
 * rendering — a <SelectItem value=""> throws in Radix and has previously
 * taken whole settings pages down through the global error boundary.
 */
export function ModelSelect({
  label, hint, value, onChange, options, placeholder = "Platform default", disabled, emptyOption,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Optional first item meaning "no value" (maps back to ""). */
  emptyOption?: string;
}) {
  const UNSET = "__unset__";
  const safeOptions = options.filter((o) => o.value);
  const known = new Set(safeOptions.map((o) => o.value));
  const custom = value && !known.has(value) ? value : "";
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <Select value={value || undefined} onValueChange={(v) => onChange(v === UNSET ? "" : v)} disabled={disabled}>
        <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {emptyOption && <SelectItem value={UNSET}>{emptyOption}</SelectItem>}
          {custom && <SelectItem value={custom}>{custom}</SelectItem>}
          {safeOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <span className="flex items-center justify-between gap-3">
                <span>{option.label}</span>
                {option.meta && <span className="text-[10px] text-muted-foreground">{option.meta}</span>}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Grouped variant — e.g. voices grouped by provider. Empty-value options
 *  are dropped for the same Radix-safety reason as ModelSelect. */
export function GroupedModelSelect({
  label, hint, value, onChange, groups, placeholder = "Platform default", emptyOption,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  groups: { label: string; options: SelectOption[] }[];
  placeholder?: string;
  /** Optional first item meaning "no value" (maps back to ""). */
  emptyOption?: string;
}) {
  const UNSET = "__unset__";
  const safeGroups = groups.map((group) => ({
    ...group,
    options: group.options.filter((o) => o.value),
  }));
  const known = new Set(safeGroups.flatMap((g) => g.options.map((o) => o.value)));
  const custom = value && !known.has(value) ? value : "";
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <Select value={value || undefined} onValueChange={(v) => onChange(v === UNSET ? "" : v)}>
        <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {emptyOption && <SelectItem value={UNSET}>{emptyOption}</SelectItem>}
          {custom && (
            <SelectGroup>
              <SelectLabel>Currently saved</SelectLabel>
              <SelectItem value={custom}>{custom}</SelectItem>
            </SelectGroup>
          )}
          {safeGroups.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <span className="flex items-center justify-between gap-3">
                    <span>{option.label}</span>
                    {option.meta && <span className="text-[10px] text-muted-foreground">{option.meta}</span>}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Text & textarea fields ──────────────────────────────────────────────────

export function TextField({
  label, hint, value, onChange, placeholder, inputMode, type = "text", error, mono, helperLink,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "decimal" | "url";
  type?: "text" | "url";
  error?: string | null;
  mono?: boolean;
  helperLink?: { label: string; href: string };
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <Input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={mono ? "font-mono" : undefined}
        aria-invalid={Boolean(error) || undefined}
      />
      {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</p>}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {helperLink && (
        <a
          href={helperLink.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-1"
        >
          <ExternalLink className="w-3 h-3" /> {helperLink.label}
        </a>
      )}
    </div>
  );
}

export function TextAreaField({
  label, hint, value, onChange, placeholder, rows = 4,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <Textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Secret field (API keys) ─────────────────────────────────────────────────

/** Password field with a "Set up / Not set" status, show/hide and Clear. */
export function SecretField({
  label, hint, value, onChange, isSet, placeholder, helperLink, onClear, clearable = true, error,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  isSet: boolean;
  placeholder?: string;
  helperLink?: { label: string; href: string };
  onClear?: () => void;
  clearable?: boolean;
  error?: string | null;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-medium">{label}</Label>
        <span className={`text-xs font-medium flex items-center gap-1 ${isSet ? "text-success" : "text-destructive"}`}>
          {isSet ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
          {isSet ? "Set up" : "Not set up yet"}
        </span>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type={visible ? "text" : "password"}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder ?? "Enter a new secret value — leave blank to keep the current one"}
            className="pr-10 font-mono"
            autoComplete="new-password"
            aria-invalid={Boolean(error) || undefined}
          />
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? "Hide secret" : "Show secret"}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
        {clearable && isSet && !value && onClear && (
          <Button type="button" variant="outline" size="sm" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</p>}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {helperLink && (
        <a
          href={helperLink.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-1"
        >
          <ExternalLink className="w-3 h-3" /> {helperLink.label}
        </a>
      )}
    </div>
  );
}

// ─── Feature toggle ──────────────────────────────────────────────────────────

/** Icon + label + description + switch, in a soft bordered tile. */
export function FeatureToggle({
  icon, label, description, checked, onChange, disabled,
}: {
  icon?: ReactNode;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/10 px-4 py-3">
      <div className="flex items-start gap-3">
        {icon && <div className="mt-0.5 text-primary [&>svg]:w-4 [&>svg]:h-4">{icon}</div>}
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

// ─── Allowed-items checkbox strip ────────────────────────────────────────────

/** "Organisation can switch between:" strip — checkboxes in a muted bar. */
export function AllowedRow({
  caption, items, checkedIds, onToggle,
}: {
  caption: string;
  items: { id: string; label: string }[];
  checkedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-muted/20 px-4 py-3">
      <span className="text-xs font-medium text-muted-foreground">{caption}</span>
      {items.map((item) => (
        <label key={item.id} className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={checkedIds.includes(item.id)}
            onCheckedChange={() => onToggle(item.id)}
          />
          {item.label}
        </label>
      ))}
    </div>
  );
}

// ─── Toggleable chips (language picks, tag-style multi-select) ───────────────

/** Rounded pill chips — tap to toggle membership. */
export function ToggleChipRow({
  items, selectedIds, onToggle, allowDeselectLast = true,
}: {
  items: { id: string; label: string }[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  allowDeselectLast?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const selected = selectedIds.includes(item.id);
        const isLast = selected && selectedIds.length === 1;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (isLast && allowDeselectLast) return; // never leave the row empty
              onToggle(item.id);
            }}
            aria-pressed={selected}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
              selected
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-muted/20 text-muted-foreground hover:border-primary/40 hover:text-foreground"
            } ${isLast && allowDeselectLast ? "opacity-70" : ""}`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Save bar ────────────────────────────────────────────────────────────────

/** The single bottom action bar: status/error + optional confirm + Save. */
export function SaveBar({
  error, saving, onSave, onReset, saveLabel = "Save changes", hint, confirm, onConfirmChange, confirmLabel, dirty = true, extra,
}: {
  error?: string | null;
  saving?: boolean;
  onSave: () => void;
  /** Optional "Discard changes" affordance. */
  onReset?: () => void;
  saveLabel?: string;
  hint?: ReactNode;
  confirm?: boolean;
  onConfirmChange?: (checked: boolean) => void;
  confirmLabel?: string;
  dirty?: boolean;
  extra?: ReactNode;
}) {
  const saveDisabled = saving || (confirm !== undefined && !confirm) || (dirty !== undefined && !dirty);
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-sm">
        {error && <span className="text-destructive flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}</span>}
        {!error && confirm !== undefined && onConfirmChange && (
          <label className="flex items-center gap-2 text-warning cursor-pointer">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(event) => onConfirmChange(event.target.checked)}
              className="rounded border-border text-primary focus:ring-primary/20"
            />
            {confirmLabel ?? "I confirm — apply these changes now"}
          </label>
        )}
        {!error && confirm === undefined && hint && (
          <span className="text-muted-foreground">{hint}</span>
        )}
        {extra}
      </div>
      <div className="flex shrink-0 gap-2">
        {onReset && (
          <Button variant="outline" onClick={onReset} disabled={saving || !dirty}>
            Discard changes
          </Button>
        )}
        <Button onClick={onSave} disabled={saveDisabled}>
          {saving ? "Saving…" : saveLabel}
        </Button>
      </div>
    </div>
  );
}

// ─── Small shared bits ───────────────────────────────────────────────────────

/** Pill row summarising statuses (used under provider cards). */
export function StatusPills({ items }: { items: { text: string; tone: "ok" | "warn" | "bad" | "neutral" }[] }) {
  if (items.length === 0) return null;
  const toneClass = {
    ok: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    warn: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    bad: "border-rose-400/30 bg-rose-400/10 text-rose-300",
    neutral: "border-border bg-muted/30 text-muted-foreground",
  } as const;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      {items.map((item) => (
        <span key={item.text} className={`rounded-full border px-2.5 py-0.5 ${toneClass[item.tone]}`}>
          {item.text}
        </span>
      ))}
    </div>
  );
}
