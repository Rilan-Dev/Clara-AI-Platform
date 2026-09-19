"use client";
/**
 * EditOrgPanel — inline edit form for organisation name, slug, logo.
 * RBAC: super_admin can edit slug; org_admin can edit name + logo only.
 */
import { useState } from "react";
import { Building2, Pencil, X, Save, Check } from "lucide-react";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";
import { Button } from "@/components/ui/button";

type Org = { id: string; name: string; slug: string; logoUrl?: string | null };

export function EditOrgPanel({
  org,
  isSuperAdmin,
  onSaved,
}: {
  org: Org;
  isSuperAdmin: boolean;
  onSaved: (updated: Org) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name,    setName]    = useState(org.name);
  const [slug,    setSlug]    = useState(org.slug);
  const [logoUrl, setLogoUrl] = useState(org.logoUrl ?? "");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [saved,   setSaved]   = useState(false);

  function resetAndClose() {
    setName(org.name); setSlug(org.slug); setLogoUrl(org.logoUrl ?? "");
    setError(null); setEditing(false);
  }

  async function handleSave() {
    if (!name.trim()) { setError("Name cannot be empty"); return; }
    setSaving(true); setError(null);
    try {
      const body: Record<string, string> = { name: name.trim() };
      if (isSuperAdmin && slug.trim()) body.slug = slug.trim();
      if (logoUrl.trim()) body.logoUrl = logoUrl.trim();
      const res  = await fetch(apiUrl(`/api/orgs/${org.id}`), {
        method:  "PATCH",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body:    JSON.stringify(body),
      });
      const data = await res.json() as Org & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setEditing(false);
      onSaved(data);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className="border border-border bg-card rounded-2xl p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" /> Organisation Details
        </h2>
        {!editing ? (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        ) : (
          <button onClick={resetAndClose} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {!editing ? (
        <div className="grid grid-cols-2 gap-4 text-sm">
          {[
            ["Name",    org.name],
            ["Slug",    `/${org.slug}`],
            ["Logo URL", org.logoUrl || "—"],
          ].map(([label, value]) => (
            <div key={label} className={label === "Logo URL" ? "col-span-2" : ""}>
              <div className="text-xs text-muted-foreground mb-1">{label}</div>
              <div className="text-foreground/80 font-mono text-xs break-all">{value}</div>
            </div>
          ))}
          {saved && <div className="col-span-2 flex items-center gap-1.5 text-emerald-600 text-xs"><Check className="w-3.5 h-3.5" /> Saved successfully</div>}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Organisation name <span className="text-destructive">*</span></label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary" />
          </div>
          {isSuperAdmin && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Slug <span className="text-muted-foreground/70">(super-admin only)</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground/70 text-sm">/</span>
                <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  className="flex-1 bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary font-mono" />
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Logo URL</label>
            <input value={logoUrl} onChange={e => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
              className="w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary" />
          </div>
          {error && <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button onClick={handleSave} disabled={saving || !name.trim()} className="gap-2">
              <Save className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save changes"}
            </Button>
            <Button variant="outline" onClick={resetAndClose} disabled={saving}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
