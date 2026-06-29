// app/admin/billing-plans/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

const ENDPOINT = "/shared/billing-plans";
const inputCls = "w-full rounded-md border bg-background px-2 py-1.5 text-sm";

const PLAN_TYPES: { value: string; label: string }[] = [
  { value: "monthly", label: "Monthly (month-to-month)" },
  { value: "term_split", label: "Termly (per-term split)" },
  { value: "full_upfront", label: "Yearly / upfront" },
];
const typeLabel = (v: string) => PLAN_TYPES.find((t) => t.value === v)?.label ?? v;

interface Plan {
  id: string;
  name: string;
  description: string | null;
  planType: string;
  installmentCount: number;
  dueDayOfMonth: number;
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

function asPlan(r: Record<string, unknown>): Plan {
  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    description: r.description == null ? null : String(r.description),
    planType: String(r.planType ?? ""),
    installmentCount: Number(r.installmentCount ?? 1),
    dueDayOfMonth: Number(r.dueDayOfMonth ?? 1),
    isActive: r.isActive !== false,
  };
}

function countHint(planType: string): string {
  if (planType === "monthly") return "fixed at 1";
  if (planType === "term_split") return "1–3";
  return "1–9";
}

export default function BillingPlansAdminPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // create form
  const [name, setName] = useState("");
  const [planType, setPlanType] = useState("term_split");
  const [count, setCount] = useState("3");
  const [dueDay, setDueDay] = useState("1");
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);

  // inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Plan | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${ENDPOINT}?includeInactive=true`);
      setPlans(toRows(res).map(asPlan).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load billing plans");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setFormMsg(null);
    if (!name.trim()) return setFormMsg("Name is required.");
    setSaving(true);
    try {
      await apiFetch(ENDPOINT, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          planType,
          installmentCount: planType === "monthly" ? 1 : Number(count) || 1,
          dueDayOfMonth: Number(dueDay) || 1,
          isActive: true,
        }),
      });
      setName("");
      setCount(planType === "term_split" ? "3" : "1");
      setDueDay("1");
      await load();
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "Couldn’t create the billing plan.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(p: Plan) {
    setEditId(p.id);
    setDraft({ ...p });
  }

  async function saveEdit() {
    if (!draft) return;
    setRowBusy(draft.id);
    try {
      await apiFetch(`${ENDPOINT}/${encodeURIComponent(draft.id)}`, {
        method: "PUT",
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description,
          planType: draft.planType,
          installmentCount: draft.planType === "monthly" ? 1 : Number(draft.installmentCount) || 1,
          dueDayOfMonth: Number(draft.dueDayOfMonth) || 1,
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

  async function toggleActive(p: Plan) {
    setRowBusy(p.id);
    try {
      await apiFetch(`${ENDPOINT}/${encodeURIComponent(p.id)}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !p.isActive }),
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
          <h1 className="text-2xl font-bold">Billing plans</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Installment rules that decide how many payments a student is split into and when each falls due.
          </p>
        </div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Admin
        </Link>
      </div>

      {/* Create */}
      <div className="mb-6 rounded-md border p-4">
        <h2 className="mb-3 text-sm font-semibold">Add a billing plan</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_8rem_8rem_auto] sm:items-end">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Name *</span>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="3-term split" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Type *</span>
            <select
              className={inputCls}
              value={planType}
              onChange={(e) => {
                const v = e.target.value;
                setPlanType(v);
                setCount(v === "monthly" ? "1" : v === "term_split" ? "3" : "10");
              }}
            >
              {PLAN_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Installments</span>
            <input
              className={inputCls}
              value={planType === "monthly" ? "1" : count}
              onChange={(e) => setCount(e.target.value)}
              inputMode="numeric"
              disabled={planType === "monthly"}
            />
            <span className="text-[10px] text-muted-foreground">{countHint(planType)}</span>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Due day</span>
            <input className={inputCls} value={dueDay} onChange={(e) => setDueDay(e.target.value)} inputMode="numeric" />
            <span className="text-[10px] text-muted-foreground">of the month (1–28)</span>
          </label>
          <Button size="sm" onClick={create} disabled={saving}>
            {saving ? "Adding…" : "Add"}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          The day-of-month rule is copied from an existing plan, so a plan must already exist in the database.
        </p>
        {formMsg && <p className="mt-2 text-xs text-destructive">{formMsg}</p>}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-muted-foreground">
          {error}
        </div>
      )}

      {!loading && plans.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Installments</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Due day</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => {
                const editing = editId === p.id && draft;
                const busy = rowBusy === p.id;
                return (
                  <tr key={p.id} className="border-b last:border-0 align-middle">
                    {editing ? (
                      <>
                        <td className="px-4 py-2">
                          <input
                            className={inputCls}
                            value={draft!.name}
                            onChange={(e) => setDraft({ ...draft!, name: e.target.value })}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <select
                            className={inputCls}
                            value={draft!.planType}
                            onChange={(e) => setDraft({ ...draft!, planType: e.target.value })}
                          >
                            {PLAN_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input
                            className={`${inputCls} w-20`}
                            value={draft!.planType === "monthly" ? 1 : draft!.installmentCount}
                            inputMode="numeric"
                            disabled={draft!.planType === "monthly"}
                            onChange={(e) => setDraft({ ...draft!, installmentCount: Number(e.target.value) || 1 })}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            className={`${inputCls} w-16`}
                            value={draft!.dueDayOfMonth}
                            inputMode="numeric"
                            onChange={(e) => setDraft({ ...draft!, dueDayOfMonth: Number(e.target.value) || 1 })}
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
                        <td className="px-4 py-2 font-medium">{p.name}</td>
                        <td className="px-4 py-2 text-muted-foreground">{typeLabel(p.planType)}</td>
                        <td className="px-4 py-2">{p.planType === "monthly" ? "1 / month" : p.installmentCount}</td>
                        <td className="px-4 py-2">{p.dueDayOfMonth}</td>
                        <td className="px-4 py-2">
                          {p.isActive ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Active</span>
                          ) : (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Inactive</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => startEdit(p)} disabled={busy}>
                              Edit
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => toggleActive(p)} disabled={busy}>
                              {busy ? "…" : p.isActive ? "Deactivate" : "Activate"}
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

      {!loading && plans.length === 0 && !error && (
        <div className="rounded-md border p-6 text-sm text-muted-foreground">
          No billing plans yet.
        </div>
      )}
    </AppShell>
  );
}
