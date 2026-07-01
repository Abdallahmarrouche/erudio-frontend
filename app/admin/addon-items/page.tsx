// app/admin/addon-items/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

const ADDONS_ENDPOINT = "/shared/addon-items";
const COA_ENDPOINT = "/shared/chart-of-accounts";
const inputCls = "w-full rounded-md border bg-background px-2 py-1.5 text-sm";

interface Addon {
  id: string;
  code: string;
  name: string;
  unit: string; // 'month' | 'day'
  unitAmount: number;
  coaAccountId: string;
  accountCode: string | null;
  accountName: string | null;
  vatApplicable: boolean;
  vatRate: number;
  isActive: boolean;
}
interface Coa {
  id: string;
  accountCode: string;
  accountName: string;
  accountType: string;
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
function asAddon(r: Record<string, unknown>): Addon {
  return {
    id: String(r.id ?? ""),
    code: String(r.code ?? ""),
    name: String(r.name ?? ""),
    unit: String(r.unit ?? ""),
    unitAmount: Number(r.unitAmount ?? 0),
    coaAccountId: String(r.coaAccountId ?? ""),
    accountCode: r.accountCode != null ? String(r.accountCode) : null,
    accountName: r.accountName != null ? String(r.accountName) : null,
    vatApplicable: r.vatApplicable === true,
    vatRate: Number(r.vatRate ?? 0),
    isActive: r.isActive !== false,
  };
}
const vatLabel = (a: { vatApplicable: boolean; vatRate: number }) =>
  a.vatApplicable && a.vatRate > 0 ? "standard" : "zero";

export default function AddonItemsAdminPage() {
  const [items, setItems] = useState<Addon[]>([]);
  const [revenue, setRevenue] = useState<Coa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // local edit drafts per row id
  const [draft, setDraft] = useState<Record<string, Addon>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rawItems, rawCoa] = await Promise.all([
        apiFetch(`${ADDONS_ENDPOINT}?includeInactive=true`),
        apiFetch(`${COA_ENDPOINT}`).catch(() => null),
      ]);
      const list = toRows(rawItems).map(asAddon);
      setItems(list);
      const d: Record<string, Addon> = {};
      for (const it of list) d[it.id] = { ...it };
      setDraft(d);
      const coa = toRows(rawCoa)
        .map((r) => ({
          id: String(r.id ?? ""),
          accountCode: String(r.accountCode ?? ""),
          accountName: String(r.accountName ?? ""),
          accountType: String(r.accountType ?? ""),
        }))
        .filter((c) => c.id && c.accountType === "revenue")
        .sort((a, b) => a.accountCode.localeCompare(b.accountCode));
      setRevenue(coa);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t load add-on items.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function edit(id: string, patch: Partial<Addon>) {
    setDraft((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
    setMsg(null);
  }

  async function save(id: string) {
    const d = draft[id];
    if (!d) return;
    if (!Number.isFinite(d.unitAmount) || d.unitAmount < 0) {
      setError("Price must be a number of 0 or more.");
      return;
    }
    setRowBusy(id);
    setError(null);
    setMsg(null);
    try {
      const zero = vatLabel(d) === "zero";
      await apiFetch(`${ADDONS_ENDPOINT}/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify({
          unitAmount: d.unitAmount,
          coaAccountId: d.coaAccountId,
          vatApplicable: !zero,
          vatRate: zero ? 0 : 5,
          isActive: d.isActive,
        }),
      });
      await load();
      setMsg(`Saved “${d.name}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t save the item.");
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Back to admin
        </Link>
        <h1 className="mt-3 text-2xl font-bold">Add-on items</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sellable extras, each mapped to a revenue account. Early drop-off bills monthly; the extra
          hour is charged per day when used. Prices are updated here (e.g. once a year).
        </p>

        {error && (
          <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="mt-6 space-y-4">
            {items.map((it) => {
              const d = draft[it.id] ?? it;
              const busy = rowBusy === it.id;
              return (
                <section key={it.id} className="rounded-md border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold">{it.name}</h2>
                      <p className="text-xs text-muted-foreground">
                        <code>{it.code}</code> · billed per {it.unit}
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={d.isActive}
                        disabled={busy}
                        onChange={(e) => edit(it.id, { isActive: e.target.checked })}
                      />
                      Active
                    </label>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <label className="block">
                      <span className="text-xs font-medium text-muted-foreground">
                        Price (AED per {it.unit})
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={`mt-1 ${inputCls}`}
                        value={String(d.unitAmount)}
                        disabled={busy}
                        onChange={(e) => edit(it.id, { unitAmount: Number(e.target.value) })}
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium text-muted-foreground">Revenue account</span>
                      <select
                        className={`mt-1 ${inputCls}`}
                        value={d.coaAccountId}
                        disabled={busy}
                        onChange={(e) => edit(it.id, { coaAccountId: e.target.value })}
                      >
                        {/* keep the current account selectable even if list is still loading */}
                        {revenue.length === 0 && (
                          <option value={d.coaAccountId}>
                            {it.accountCode ? `${it.accountCode} — ${it.accountName}` : "Current account"}
                          </option>
                        )}
                        {revenue.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.accountCode} — {c.accountName}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium text-muted-foreground">VAT treatment</span>
                      <select
                        className={`mt-1 ${inputCls}`}
                        value={vatLabel(d)}
                        disabled={busy}
                        onChange={(e) =>
                          edit(it.id, {
                            vatApplicable: e.target.value === "standard",
                            vatRate: e.target.value === "standard" ? 5 : 0,
                          })
                        }
                      >
                        <option value="zero">Zero-rated (0%)</option>
                        <option value="standard">Standard (5%)</option>
                      </select>
                    </label>
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <Button onClick={() => save(it.id)} disabled={busy}>
                      {busy ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </section>
              );
            })}
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No add-on items found. Run migration 10 to seed them.
              </p>
            )}
          </div>
        )}

        {msg && <p className="mt-4 text-sm text-muted-foreground">{msg}</p>}
      </div>
    </AppShell>
  );
}
