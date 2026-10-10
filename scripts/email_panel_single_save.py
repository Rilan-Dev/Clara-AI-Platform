#!/usr/bin/env python3
"""EmailDeliveryPanel: per-input Save buttons -> ONE form-level Save bar.

Keep: per-card Activate (a mode-switch ACTION), the test-email tool.
Remove: per-input Save buttons. Add: dirty tracking + one Save bar."""
PATH = "/home/z/my-project/.worktrees/vc/src/components/admin/EmailDeliveryPanel.tsx"
src = open(PATH).read()

# 1) Imports: drop Save icon (unused after per-input removal)
old_imports = """import {
  Mail, Send, Eye, EyeOff, Save, CheckCircle2, AlertCircle,
  Zap, Server, TestTube2, Loader2,
} from "lucide-react";"""
new_imports = """import {
  Mail, Send, Eye, EyeOff, CheckCircle2, AlertCircle,
  Zap, Server, TestTube2, Loader2,
} from "lucide-react";"""
assert old_imports in src, "imports anchor"
src = src.replace(old_imports, new_imports, 1)

# 2) Component state: per-key saving/saved -> form-level + initial snapshot
old_state = """  const [settings, setSettings] = useState<EnvSetting[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState<string | null>(null);"""
new_state = """  const [settings, setSettings] = useState<EnvSetting[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const [savedAll, setSavedAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState<string | null>(null);"""
assert old_state in src, "state anchor"
src = src.replace(old_state, new_state, 1)

# 3) load(): snapshot initial values
old_init = """      const init: Record<string, string> = {};
      for (const s of emailSettings) {
        init[s.key] = s.isSecret ? "" : (s.value === MASK ? "" : s.value);
      }
      setValues(init);"""
new_init = """      const init: Record<string, string> = {};
      for (const s of emailSettings) {
        init[s.key] = s.isSecret ? "" : (s.value === MASK ? "" : s.value);
      }
      setValues(init);
      setInitialValues(init);"""
assert old_init in src, "init anchor"
src = src.replace(old_init, new_init, 1)

# 4) handleSave -> dirty tracking + saveAll
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
new_handle = """  const ALL_FIELDS = [...COMMON_FIELDS, ...RESEND_FIELDS, ...SMTP_FIELDS];

  /** Dirty keys — a blank secret is "unchanged" (masked server-side). */
  const dirtyKeys = ALL_FIELDS.filter((f) => {
    const val = values[f.key] ?? "";
    if (f.isSecret && !val) return false;
    return val !== (initialValues[f.key] ?? "");
  });

  /** ONE save for the whole form (sender identity + both provider cards):
   *  fill everything in, then save once. Activation stays a separate
   *  explicit action per card. */
  const handleSaveAll = async () => {
    if (dirtyKeys.length === 0 || savingAll) return;
    setSavingAll(true);
    setError(null);
    setSavedAll(false);
    try {
      for (const f of dirtyKeys) {
        await saveSetting(f.key, values[f.key] ?? "");
      }
      setSavedAll(true);
      setTimeout(() => setSavedAll(false), 3000);
      await load();
    } catch (e) {
      setError(`Failed to save ${dirtyKeys[0]?.key ?? "settings"}: ${(e as Error).message}`);
    } finally {
      setSavingAll(false);
    }
  };"""
assert old_handle in src, "handleSave anchor"
src = src.replace(old_handle, new_handle, 1)

# 5) renderField: remove the per-input Save button (keep eye toggle)
old_field = """        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={field.isSecret && !showPassword ? "password" : "text"}
              value={value}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              placeholder={field.placeholder}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none"
            />
            {field.isSecret && (
              <button
                type="button"
                onClick={() => setVisibility((v) => ({ ...v, [field.key]: !v[field.key] }))}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-muted-foreground"
                aria-label={showPassword ? "Hide" : "Show"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleSave(field.key)}
            disabled={saving === field.key || (field.isSecret && !value)}
            className="shrink-0"
          >
            {saving === field.key ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved === field.key ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saved === field.key ? "Saved" : "Save"}
          </Button>
        </div>
        {field.helpText && <p className="text-xs text-muted-foreground/70">{field.helpText}</p>}"""
new_field = """        <div className="relative">
          <input
            type={field.isSecret && !showPassword ? "password" : "text"}
            value={value}
            onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
            placeholder={field.placeholder}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none"
          />
          {field.isSecret && (
            <button
              type="button"
              onClick={() => setVisibility((v) => ({ ...v, [field.key]: !v[field.key] }))}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-muted-foreground"
              aria-label={showPassword ? "Hide" : "Show"}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
        </div>
        {field.helpText && <p className="text-xs text-muted-foreground/70">{field.helpText}</p>}"""
assert old_field in src, "renderField anchor"
src = src.replace(old_field, new_field, 1)

# 6) Add the single Save bar before the Test send section
old_test = """      {/* Test send */}"""
new_test = """      {/* ONE form-level Save — sender identity + both provider cards save
          together (credentials are batch-coherent; activation remains a
          per-card action above). */}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-5 py-3 shadow-lg backdrop-blur">
        <p className="text-xs text-muted-foreground">
          {savingAll
            ? "Saving…"
            : savedAll
              ? "All changes saved."
              : dirtyKeys.length > 0
                ? `${dirtyKeys.length} unsaved ${dirtyKeys.length === 1 ? "field" : "fields"} — enter everything, then save once.`
                : "No pending changes across sender identity, Resend and SMTP."}
        </p>
        <Button
          onClick={() => void handleSaveAll()}
          disabled={dirtyKeys.length === 0 || savingAll}
          className="shrink-0"
        >
          {savingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : savedAll ? <CheckCircle2 className="w-4 h-4" /> : null}
          {savingAll
            ? "Saving…"
            : savedAll
              ? "Saved"
              : dirtyKeys.length === 1
                ? "Save 1 field"
                : `Save ${dirtyKeys.length} fields`}
        </Button>
      </div>

      {/* Test send */}"""
assert old_test in src, "test anchor"
src = src.replace(old_test, new_test, 1)

open(PATH, "w").write(src)
print("EmailDeliveryPanel transformed OK")
