"use client";
/**
 * EditAgentPanel — inline edit for agent name and description.
 * RBAC: super_admin and org_admin can edit; org role checked server-side.
 */
import { useState } from "react";
import { Bot, Pencil, X, Save, Check } from "lucide-react";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";
import { Button } from "@/components/ui/button";

type Agent = { id: string; name: string; description?: string | null };

export function EditAgentPanel({
  agent,
  canEdit,
  onSaved,
}: {
  agent: Agent;
  canEdit: boolean;
  onSaved: (updated: Agent) => void;
}) {
  const [editing,     setEditing]     = useState(false);
  const [name,        setName]        = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? "");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [saved,       setSaved]       = useState(false);

  function resetAndClose() {
    setName(agent.name); setDescription(agent.description ?? "");
    setError(null); setEditing(false);
  }

  async function handleSave() {
    if (!name.trim()) { setError("Name cannot be empty"); return; }
    setSaving(true); setError(null);
    try {
      const res  = await fetch(apiUrl(`/api/agents/${agent.id}`), {
        method:  "PATCH",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body:    JSON.stringify({ name: name.trim(), description: description.trim() || null }),
      });
      const data = await res.json() as Agent & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setEditing(false);
      onSaved(data);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className="border border-border bg-card rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <Bot className="w-4 h-4 text-primary" /> Agent Details
        </h2>
        {canEdit && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        )}
        {editing && (
          <button onClick={resetAndClose} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {!editing ? (
        <div className="space-y-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Name</div>
            <div className="text-foreground/80">{agent.name}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Description</div>
            <div className="text-muted-foreground">{agent.description || <span className="text-muted-foreground/70 italic">No description</span>}</div>
          </div>
          {saved && <div className="flex items-center gap-1.5 text-emerald-600 text-xs"><Check className="w-3.5 h-3.5" /> Saved successfully</div>}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Agent name <span className="text-destructive">*</span></label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              rows={3} placeholder="Describe this agent…"
              className="w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary resize-none" />
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
