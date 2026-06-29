// app/admin/chart-of-accounts/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

const ENDPOINT = "/shared/chart-of-accounts";
const inputCls = "w-full rounded-md border bg-background px-2 py-1.5 text-sm";

interface Account {
  id: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  isActive: boolean;
  allowDirectPosting: boolean;
}

function toRows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const k of ["data", "items", "results", "rows", "value"]) {
      if (Array.isArray(obj[k])) return obj[k] as Record<string, unknown>[];
    }
  }
  return [];
}

function asAccount(r: Record<string, unknown>): Account {
  return {
    id: String(r.id ?? ""),
    accountCode: String(r.accountCode ?? ""),
    accountName: String(r.accountName ?? ""),
    accountType: String(r.accountType ?? ""),
    normalBalance: String(r.normalBalance ?? ""),
    isActive: r.isActive !== false,
    allowDirectPosting: r.allowDirectPosting !== false,
  };
}

export default function ChartOfAccountsAdminPage() {
  const [rows, setRows] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Account | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${ENDPOINT}?includeInactive=true`);
      setRows(toRows(res).map(asAccount).sort((a, b) => a.accountCode.localeCompare(b.accountCode)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chart of accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const types = useMemo(
    () => Array.from(new Set(rows.map((r) => r.accountType))).sort(),
    [rows]
  );
  useEffect(() => {
    if (!type && types.length) setType(types[0]);
  }, [types, type]);

  async function create() {
    setFormMsg(null);
    if (!code.trim()) return setFormMsg("Code is required.");
    if (!name.trim()) return setFormMsg("Name is required.");
    if (!type) return setFormMsg("Type is required.");
    setSaving(true);
    try {
      await apiFetch(ENDPOINT, {
        method: "POST",
        body: JSON.stringify({
          accountCode: code.trim(),
          accountName: name.trim(),
          accountType: type,
          allowDirectPosting: true,
          isActive: true,
        }),
      });
      setCode("");
      setName("");
      await load();
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "Couldn’t create the account.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(a: Account) {
    setEditId(a.id);
    setDraft({ ...a });
  }

  async function saveEdit() {
    if (!draft) return;
    setRowBusy(draft.id);
    try {
      await apiFetch(`${ENDPOINT}/${encodeURIComponent(draft.id)}`, {
        method: "PUT",
        body: JSON.stringify({
          accountName: draft.accountName.trim(),
          allowDirectPosting: draft.allowDirectPosting,
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

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.accountCode.toLowerCase().includes(q) ||
        r.accountName.toLowerCase().includes(q) ||
        r.accountType.toLowerCase().includes(q)
    );
  }, [rows, filter]);

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Chart of accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The general-ledger accounts everything posts to. Codes and types are fixed once created
            (the accounting engine references them) — name, postable, and active status can be edited.
          </p>
        </div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Admin
        </Link>
      </div>

      <div className="mb-6 rounded-md border p-4">
        <h2 className="mb-3 text-sm font-semibold">Add an account</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[8rem_1fr_10rem_auto] sm:items-end">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Code *</span>
            <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} placeholder="4100" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Name *</span>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tuition Revenue" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Type *</span>
            <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
              {types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <Button size="sm" onClick={create} disabled={saving || types.length === 0}>
            {saving ? "Adding…" : "Add"}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Normal balance is set automatically to match other accounts of the same type.
        </p>
        {formMsg && <p className="mt-2 text-xs text-destructive">{formMsg}</p>}
      </div>

      <div className="mb-2 flex items-center justify-between gap-3">
        <input
          className={`${inputCls} max-w-xs`}
          placeholder="Filter by code, name or type…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">{loading ? "Loading…" : `${rows.length} accounts`}</span>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-muted-foreground">
          {error}
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Code</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Normal</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Postable</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => {
                const editing = editId === a.id && draft;
                const busy = rowBusy === a.id;
                return (
                  <tr key={a.id} className="border-b last:border-0 align-middle">
                    <td className="px-4 py-2 font-mono text-xs">{a.accountCode}</td>
                    <td className="px-4 py-2">
                      {editing ? (
                        <input className={inputCls} value={draft!.accountName} onChange={(e) => setDraft({ ...draft!, accountName: e.target.value })} />
                      ) : (
                        a.accountName
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{a.accountType}</td>
                    <td className="px-4 py-2 text-muted-foreground">{a.normalBalance}</td>
                    <td className="px-4 py-2">
                      {editing ? (
                        <input type="checkbox" checked={draft!.allowDirectPosting} onChange={(e) => setDraft({ ...draft!, allowDirectPosting: e.target.checked })} />
                      ) : a.allowDirectPosting ? (
                        "Yes"
                      ) : (
                        <span className="text-muted-foreground">No</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {editing ? (
                        <label className="inline-flex items-center gap-1 text-xs">
                          <input type="checkbox" checked={draft!.isActive} onChange={(e) => setDraft({ ...draft!, isActive: e.target.checked })} />
                          Active
                        </label>
                      ) : a.isActive ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Active</span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {editing ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={saveEdit} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
                          <Button size="sm" variant="outline" onClick={() => { setEditId(null); setDraft(null); }} disabled={busy}>Cancel</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => startEdit(a)} disabled={busy}>Edit</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No accounts match “{filter}”.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
