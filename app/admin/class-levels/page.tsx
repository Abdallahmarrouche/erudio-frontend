// app/admin/class-levels/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

const ENDPOINT = "/shared/class-levels";
const inputCls = "w-full rounded-md border bg-background px-2 py-1.5 text-sm";

interface Level {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

function toRows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const k of ["data", "items", "results", "records", "rows", "value"]) {
      if (Array.isArray(obj[k])) return obj[k] as Record<string, unknown>[];
    }
  }
  return [];
}

function asLevel(r: Record<string, unknown>): Level {
  return {
    id: String(r.id ?? ""),
    code: String(r.code ?? ""),
    name: String(r.name ?? ""),
    sortOrder: Number(r.sortOrder ?? 0),
    isActive: r.isActive !== false,
  };
}

export default function ClassLevelsAdminPage() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // create form
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);

  // inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Level | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${ENDPOINT}?includeInactive=true`);
      setLevels(toRows(res).map(asLevel).sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load class levels");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setFormMsg(null);
    if (!code.trim()) return setFormMsg("Code is required.");
    if (!name.trim()) return setFormMsg("Name is required.");
    setSaving(true);
    try {
      await apiFetch(ENDPOINT, {
        method: "POST",
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          sortOrder: sortOrder.trim() === "" ? levels.length : Number(sortOrder),
          isActive: true,
        }),
      });
      setCode("");
      setName("");
      setSortOrder("");
      await load();
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "Couldn’t create the class level.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(l: Level) {
    setEditId(l.id);
    setDraft({ ...l });
  }

  async function saveEdit() {
    if (!draft) return;
    setRowBusy(draft.id);
    try {
      await apiFetch(`${ENDPOINT}/${encodeURIComponent(draft.id)}`, {
        method: "PUT",
        body: JSON.stringify({
          code: draft.code.trim(),
          name: draft.name.trim(),
          sortOrder: Number(draft.sortOrder),
          isActive: draft.isActive,
        }),
      });
      setEditId(null);
      setDraft(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t save changes.");
    } finally {
      setRowBusy(null);
    }
  }

  async function toggleActive(l: Level) {
    setRowBusy(l.id);
    try {
      await apiFetch(`${ENDPOINT}/${encodeURIComponent(l.id)}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !l.isActive }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t update status.");
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Class levels</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The structural class levels (e.g. FS1, FS2) that fee templates and students attach to.
          </p>
        </div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Admin
        </Link>
      </div>

      {/* Create */}
      <div className="mb-6 rounded-md border p-4">
        <h2 className="mb-3 text-sm font-semibold">Add a class level</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[8rem_1fr_6rem_auto] sm:items-end">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Code *</span>
            <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} placeholder="FS1" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Name *</span>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Foundation Stage 1" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Sort</span>
            <input
              className={inputCls}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              inputMode="numeric"
              placeholder={String(levels.length)}
            />
          </label>
          <Button size="sm" onClick={create} disabled={saving}>
            {saving ? "Adding…" : "Add"}
          </Button>
        </div>
        {formMsg && <p className="mt-2 text-xs text-destructive">{formMsg}</p>}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-muted-foreground">
          {error}
        </div>
      )}

      {!loading && levels.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Sort</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Code</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((l) => {
                const editing = editId === l.id && draft;
                const busy = rowBusy === l.id;
                return (
                  <tr key={l.id} className="border-b last:border-0 align-middle">
                    {editing ? (
                      <>
                        <td className="px-4 py-2">
                          <input
                            className={`${inputCls} w-16`}
                            value={draft!.sortOrder}
                            inputMode="numeric"
                            onChange={(e) => setDraft({ ...draft!, sortOrder: Number(e.target.value) || 0 })}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            className={`${inputCls} w-24`}
                            value={draft!.code}
                            onChange={(e) => setDraft({ ...draft!, code: e.target.value })}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            className={inputCls}
                            value={draft!.name}
                            onChange={(e) => setDraft({ ...draft!, name: e.target.value })}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <label className="inline-flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={draft!.isActive}
                              onChange={(e) => setDraft({ ...draft!, isActive: e.target.checked })}
                            />
                            Active
                          </label>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" onClick={saveEdit} disabled={busy}>
                              {busy ? "Saving…" : "Save"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditId(null);
                                setDraft(null);
                              }}
                              disabled={busy}
                            >
                              Cancel
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 text-muted-foreground">{l.sortOrder}</td>
                        <td className="px-4 py-2 font-medium">{l.code}</td>
                        <td className="px-4 py-2">{l.name}</td>
                        <td className="px-4 py-2">
                          {l.isActive ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Active</span>
                          ) : (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Inactive</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => startEdit(l)} disabled={busy}>
                              Edit
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => toggleActive(l)} disabled={busy}>
                              {busy ? "…" : l.isActive ? "Deactivate" : "Activate"}
                            </Button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && levels.length === 0 && !error && (
        <div className="rounded-md border p-6 text-sm text-muted-foreground">
          No class levels yet. Add your first one above.
        </div>
      )}
    </AppShell>
  );
}
