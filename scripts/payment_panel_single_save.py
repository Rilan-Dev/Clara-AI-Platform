#!/usr/bin/env python3
"""PaymentGatewayPanel: per-input save icons -> ONE form-level Save bar."""
import re
import sys

PATH = "/home/z/my-project/.worktrees/vc/src/components/admin/PaymentGatewayPanel.tsx"
src = open(PATH).read()

# 1) Imports: Save icon no longer used (per-input icons gone); Loader2 already added
old_imports = 'import { CreditCard, Eye, EyeOff, Save, CheckCircle2, AlertCircle, ExternalLink, Loader2 } from "lucide-react";'
new_imports = 'import { CreditCard, Eye, EyeOff, CheckCircle2, AlertCircle, ExternalLink, Loader2 } from "lucide-react";'
assert old_imports in src, "imports anchor"
src = src.replace(old_imports, new_imports, 1)

# 2) saveSetting: allow empty validation + add validateSetting helper before it
old_sig = "async function saveSetting(key: string, value: string): Promise<void> {\n  const normalizedValue = value.trim();\n\n  // Keep credentials deterministic"
new_sig = """function validateSetting(key: string, value: string): string | null {
  const normalizedValue = value.trim();

  // Keep credentials deterministic: accidental leading/trailing whitespace must
  // never reach Stripe/Razorpay and produce a misleading "invalid API key" error.
  // Empty values pass here (clearing a field is a legal save once configured).
  if (key === "STRIPE_SECRET_KEY" && normalizedValue && !/^sk_(test|live)_[A-Za-z0-9]+$/.test(normalizedValue)) {
    return "Invalid Stripe secret key format. Use the server-side sk_test_… or sk_live_… key from Stripe.";
  }
  if (key === "STRIPE_WEBHOOK_SECRET" && normalizedValue && !/^whsec_[A-Za-z0-9]+$/.test(normalizedValue)) {
    return "Invalid Stripe webhook secret format. Use the whsec_… signing secret from Stripe Webhooks.";
  }
  if (key.startsWith("STRIPE_PRICE_") && normalizedValue && !/^price_[A-Za-z0-9]+$/.test(normalizedValue)) {
    return "Invalid Stripe Price ID format. Use a price_… ID from the same Stripe account/mode.";
  }
  return null;
}

async function saveSetting(key: string, value: string): Promise<void> {
  const normalizedValue = value.trim();
  const invalid = validateSetting(key, normalizedValue);
  if (invalid) throw new Error(invalid);

  // Keep credentials deterministic"""
assert old_sig in src, "saveSetting anchor"
src = src.replace(old_sig, new_sig, 1)

# 3) Remove the old inline format checks inside saveSetting (now in validateSetting)
for block in [
  """  if (key === "STRIPE_SECRET_KEY" && !/^sk_(test|live)_[A-Za-z0-9]+$/.test(normalizedValue)) {
    throw new Error("Invalid Stripe secret key format. Use the server-side sk_test_… or sk_live_… key from Stripe.");
  }
""",
  """  if (key === "STRIPE_WEBHOOK_SECRET" && !/^whsec_[A-Za-z0-9]+$/.test(normalizedValue)) {
    throw new Error("Invalid Stripe webhook secret format. Use the whsec_… signing secret from Stripe Webhooks.");
  }
""",
  """  if (key.startsWith("STRIPE_PRICE_") && normalizedValue && !/^price_[A-Za-z0-9]+$/.test(normalizedValue)) {
    throw new Error("Invalid Stripe Price ID format. Use a price_… ID from the same Stripe account/mode.");
  }

""",
]:
    if block in src:
        src = src.replace(block, "", 1)

# 4) Component state: per-key saving/saved -> form-level
old_state = """  const [values, setValues] = useState<Record<string, string>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);"""
new_state = """  const [values, setValues] = useState<Record<string, string>>({});
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [savingAll, setSavingAll] = useState(false);
  const [savedAll, setSavedAll] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);"""
assert old_state in src, "state anchor"
src = src.replace(old_state, new_state, 1)

# 5) load(): snapshot initial values
old_init = """      const init: Record<string, string> = {};
      for (const s of paymentSettings) {
        init[s.key] = s.isSecret ? "" : (s.value === MASK ? "" : s.value);
      }
      setValues(init);"""
new_init = """      const init: Record<string, string> = {};
      for (const s of paymentSettings) {
        init[s.key] = s.isSecret ? "" : (s.value === MASK ? "" : s.value);
      }
      setValues(init);
      setInitialValues(init);"""
assert old_init in src, "init anchor"
src = src.replace(old_init, new_init, 1)

# 6) handleSave -> dirty tracking + saveAll
old_handle = """  const handleSave = async (key: string) => {
    const val = values[key] ?? "";
    setSaving(key);
    setError(null);
    setSaved(null);
    try {
      await saveSetting(key, val);
      setSaved(key);
      setTimeout(() => setSaved(null), 3000);
      await load();
    } catch (e) {
      setError(`Failed to save ${key}: ${(e as Error).message}`);
    } finally {
      setSaving(null);
    }
  };"""
new_handle = """  const ALL_FIELDS = [...STRIPE_FIELDS, ...RAZORPAY_FIELDS, ...GENERAL_FIELDS];

  /** Dirty keys — a blank secret is "unchanged" (masked server-side). */
  const dirtyKeys = ALL_FIELDS.filter((f) => {
    const val = values[f.key] ?? "";
    if (f.isSecret && !val) return false;
    return val !== (initialValues[f.key] ?? "");
  });

  /** ONE save for the whole form: validate every dirty field, then persist
   *  them sequentially through the two-step HMAC env flow. */
  const handleSaveAll = async () => {
    if (dirtyKeys.length === 0 || savingAll) return;
    const errors: Record<string, string> = {};
    for (const f of dirtyKeys) {
      const invalid = validateSetting(f.key, values[f.key] ?? "");
      if (invalid) errors[f.key] = invalid;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError("Fix the highlighted fields before saving.");
      return;
    }
    setSavingAll(true);
    setError(null);
    setSavedAll(false);
    try {
      for (const f of dirtyKeys) {
        await saveSetting(f.key, values[f.key] ?? "");
      }
      setSavedAll(true);
      setFieldErrors({});
      setTimeout(() => setSavedAll(false), 3000);
      await load();
    } catch (e) {
      setError(`Failed to save: ${(e as Error).message}`);
    } finally {
      setSavingAll(false);
    }
  };"""
assert old_handle in src, "handleSave anchor"
src = src.replace(old_handle, new_handle, 1)

# 7) renderField: drop the per-input save icon, keep eye toggle, add error line
old_field_tail = """        <div className="relative">
          <input
            type={field.isSecret && !showPassword ? "password" : "text"}
            value={value}
            onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
            placeholder={field.placeholder}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono text-foreground/80 placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 pr-20"
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {field.isSecret && (
              <button
                onClick={() => toggleVisibility(field.key)}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground/70 transition-colors"
                title={showPassword ? "Hide" : "Show"}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleSave(field.key)}
              disabled={saving === field.key || !value}
              className="h-7 px-2 text-xs"
            >
              {saving === field.key ? (
                <span className="animate-spin">⏳</span>
              ) : saved === field.key ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>
        </div>

        {field.helpText && (
          <p className="text-xs text-muted-foreground/70">{field.helpText}</p>
        )}
      </div>
    );
  };"""
new_field_tail = """        <div className="relative">
          <input
            type={field.isSecret && !showPassword ? "password" : "text"}
            value={value}
            onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
            placeholder={field.placeholder}
            className={`w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono text-foreground/80 placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/30 pr-10 ${
              fieldErrors[field.key]
                ? "border-destructive/60 focus:border-destructive focus:ring-destructive/30"
                : "border-input focus:border-primary/50"
            }`}
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {field.isSecret && (
              <button
                onClick={() => toggleVisibility(field.key)}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground/70 transition-colors"
                title={showPassword ? "Hide" : "Show"}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>

        {fieldErrors[field.key] ? (
          <p className="text-xs text-destructive">{fieldErrors[field.key]}</p>
        ) : field.helpText ? (
          <p className="text-xs text-muted-foreground/70">{field.helpText}</p>
        ) : null}
      </div>
    );
  };"""
assert old_field_tail in src, "renderField anchor"
src = src.replace(old_field_tail, new_field_tail, 1)

# 8) Add the single Save bar after the General fields card (before the info notice)
old_notice = """      {/* Info notice */}"""
new_notice = """      {/* ONE form-level Save — enter everything, review, save once.
          Per-input save icons are deliberately gone (platform save policy). */}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-5 py-3 shadow-lg backdrop-blur">
        <p className="text-xs text-muted-foreground">
          {savingAll
            ? "Saving…"
            : savedAll
              ? "All changes saved."
              : dirtyKeys.length > 0
                ? `${dirtyKeys.length} unsaved ${dirtyKeys.length === 1 ? "change" : "changes"} — review the highlighted fields, then save once.`
                : "No pending changes across Stripe, Razorpay and General."}
        </p>
        <Button
          onClick={() => void handleSaveAll()}
          disabled={dirtyKeys.length === 0 || savingAll}
          className="shrink-0"
        >
          {savingAll ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : savedAll ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : null}
          {savingAll ? "Saving…" : savedAll ? "Saved" : `Save ${dirtyKeys.length > 0 ? dirtyKeys.length : ""} ${dirtyKeys.length === 1 ? "change" : "changes"}`.replace("  ", " ")}
        </Button>
      </div>

      {/* Info notice */}"""
assert old_notice in src, "notice anchor"
src = src.replace(old_notice, new_notice, 1)

# 9) Header copy: reflect the single-save flow
old_header_copy = "Configure Stripe (USD) and Razorpay (INR) credentials. Changes take effect immediately — no restart required."
new_header_copy = "Configure Stripe (USD) and Razorpay (INR) credentials. Fill in everything, then save once — changes take effect immediately, no restart required."
assert old_header_copy in src, "header copy anchor"
src = src.replace(old_header_copy, new_header_copy, 1)

open(PATH, "w").write(src)
print("PaymentGatewayPanel transformed OK")
