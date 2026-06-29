// app/admin/bank-accounts/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

const ENDPOINT = "/shared/bank-accounts";
const inputCls = "w-full rounded-md border bg-background px-2 py-1.5 text-sm";

const TYPES: { value: string; label: string }[] = [
  { value: "current", label: "Current" },
  { value: "savings", label: "Savings" },
  { value: "cash", label: "Cash" },
  { value: "petty_cash", label: "Petty cash" },
  { value: "pdc_holding", label: "PDC holding" },
];
const typeLabel = (v: string) => TYPES.find((t) => t.value === v)?.label ?? v;

interface Bank {
  id: string;
  accountName: string;
  accountNumber: string | null;
  bankName: string | null;
  branch: string | null;
  iban: string | null;
  accountType: string;
  isDefault: boolean;
  isActive: boolean;
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
const s = (v: unknown) => (v == null ? null : String(v));

function asBank(r: Record<string, unknown>): Bank {
  return {
    id: String(r.id ?? ""),
    accountName: String(r.accountName ?? ""),
    accountNumber: s(r.accountNumber),
    bankName: s(r.bankName),
    branch: s(r.branch),
    iban: s(r.iban),
    accountType: String(r.accountType ?? "current"),
    isDefault: r.isDefault === true,
    isActive: r.isActive !== false,
  };
}

export default function BankAccountsAdminPage() {
  const [rows, setRows] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState("current");
  const [bank, setBank] = useState("");
  const [number, setNumber] = useState("");
  const [iban, setIban] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Bank | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${ENDPOINT}?includeInactive=true`);
      setRows(toRows(res).map(asBank));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bank accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setFormMsg(null);
    if (!name.trim()) return setFormMsg("Account name is required.");
    setSaving(true);
    try {
      await apiFetch(ENDPOINT, {
        method: "POST",
        body: JSON.stringify({
          accountName: name.trim(),
          accountType: type,
          bankName: bank.trim() || null,
          accountNumber: number.trim() || null,
          iban: iban.trim() || null,
          isDefault: makeDefault,
          isActive: true,
        }),
      });
      setName("");
      setBank("");
      setNumber("");
      setIban("");
      setMakeDefault(false);
      await load();
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "Couldn’t create the bank account.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(b: Bank) {
    setEditId(b.id);
    setDraft({ ...b });
  }

  async function saveEdit() {
    if (!draft) return;
    setRowBusy(draft.id);
    try {
      await apiFetch(`${ENDPOINT}/${encodeURIComponent(draft.id)}`, {
        method: "PUT",
        body: JSON.stringify({
          accountName: draft.accountName.trim(),
          accountType: draft.accountType,
          bankName: draft.bankName,
          accountNumber: draft.accountNumber,
          iban: draft.iban,
          branch: draft.branch,
          isDefault: draft.isDefault,
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

  async function patch(b: Bank, body: Record<string, unknown>) {
    setRowBusy(b.id);
    try {
      await apiFetch(`${ENDPOINT}/${encodeURIComponent(b.id)}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t update.");
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bank accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The accounts that receipts and payments are deposited into. One can be marked default.
          </p>
        </div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Admin
        </Link>
      </div>

      <div className="mb-6 rounded-md border p-4">
        <h2 className="mb-3 text-sm font-semibold">Add a bank account</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Account name *</span>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Main Operating Account" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Type *</span>
            <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Bank</span>
            <input className={inputCls} value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Emirates NBD" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Account number</span>
            <input className={inputCls} value={number} onChange={(e) => setNumber(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">IBAN</span>
            <input className={inputCls} value={iban} onChange={(e) => setIban(e.target.value)} placeholder="AE…" />
          </label>
          <label className="flex items-end gap-2 pb-1.5">
            <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
            <span className="text-sm">Make default</span>
          </label>
        </div>
        <div className="mt-3">
          <Button size="sm" onClick={create} disabled={saving}>
            {saving ? "Adding…" : "Add account"}
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

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Account</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Bank</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Number / IBAN</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Default</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const editing = editId === b.id && draft;
                const busy = rowBusy === b.id;
                if (editing) {
                  return (
                    <tr key={b.id} className="border-b last:border-0 align-middle">
                      <td className="px-4 py-2">
                        <input className={inputCls} value={draft!.accountName} onChange={(e) => setDraft({ ...draft!, accountName: e.target.value })} />
                      </td>
                      <td className="px-4 py-2">
                        <input className={inputCls} value={draft!.bankName ?? ""} onChange={(e) => setDraft({ ...draft!, bankName: e.target.value || null })} />
                      </td>
                      <td className="px-4 py-2">
                        <select className={inputCls} value={draft!.accountType} onChange={(e) => setDraft({ ...draft!, accountType: e.target.value })}>
                          {TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input className={inputCls} value={draft!.iban ?? draft!.accountNumber ?? ""} onChange={(e) => setDraft({ ...draft!, iban: e.target.value || null })} placeholder="IBAN" />
                      </td>
                      <td className="px-4 py-2">
                        <label className="inline-flex items-center gap-1 text-xs">
                          <input type="checkbox" checked={draft!.isDefault} onChange={(e) => setDraft({ ...draft!, isDefault: e.target.checked })} />
                          Default
                        </label>
                      </td>
                      <td className="px-4 py-2">
                        <label className="inline-flex items-center gap-1 text-xs">
                          <input type="checkbox" checked={draft!.isActive} onChange={(e) => setDraft({ ...draft!, isActive: e.target.checked })} />
                          Active
                        </label>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={saveEdit} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
                          <Button size="sm" variant="outline" onClick={() => { setEditId(null); setDraft(null); }} disabled={busy}>Cancel</Button>
                        </div>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={b.id} className="border-b last:border-0 align-middle">
                    <td className="px-4 py-2 font-medium">{b.accountName}</td>
                    <td className="px-4 py-2 text-muted-foreground">{b.bankName ?? "—"}</td>
                    <td className="px-4 py-2">{typeLabel(b.accountType)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{b.iban ?? b.accountNumber ?? "—"}</td>
                    <td className="px-4 py-2">
                      {b.isDefault ? (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">Default</span>
                      ) : (
                        <button className="text-xs text-muted-foreground hover:underline" disabled={busy || !b.isActive} onClick={() => patch(b, { isDefault: true })}>
                          Make default
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {b.isActive ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Active</span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => startEdit(b)} disabled={busy}>Edit</Button>
                        <Button size="sm" variant="outline" onClick={() => patch(b, { isActive: !b.isActive })} disabled={busy || (b.isDefault && b.isActive)}>
                          {busy ? "…" : b.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && rows.length === 0 && !error && (
        <div className="rounded-md border p-6 text-sm text-muted-foreground">No bank accounts yet. Add your first one above.</div>
      )}
    </AppShell>
  );
}
