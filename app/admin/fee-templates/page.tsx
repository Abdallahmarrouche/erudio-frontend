// app/admin/fee-templates/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

const ENDPOINT = "/accounts/fee-templates";

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
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

type Edit = { yearly: string; termly: string; monthly: string };

export default function FeePricingPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = toRows(await apiFetch(ENDPOINT));
      setRows(data);
      const e: Record<string, Edit> = {};
      for (const r of data) {
        e[String(r.id)] = {
          yearly: r.tuitionYearly != null ? String(r.tuitionYearly) : "",
          termly: r.tuitionTermly != null ? String(r.tuitionTermly) : "",
          monthly: r.tuitionMonthly != null ? String(r.tuitionMonthly) : "",
        };
      }
      setEdits(e);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load fee templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function set(id: string, field: keyof Edit, value: string) {
    setEdits((p) => ({ ...p, [id]: { ...p[id], [field]: value } }));
    setMsg((m) => ({ ...m, [id]: "" }));
  }

  async function save(id: string) {
    const e = edits[id];
    if (!e) return;
    setSavingId(id);
    setMsg((m) => ({ ...m, [id]: "" }));
    try {
      await apiFetch(`${ENDPOINT}/${encodeURIComponent(id)}/pricing`, {
        method: "PUT",
        body: JSON.stringify({
          tuitionYearly: num(e.yearly),
          tuitionTermly: num(e.termly),
          tuitionMonthly: num(e.monthly),
        }),
      });
      await load();
      setMsg((m) => ({ ...m, [id]: "Saved." }));
    } catch (err) {
      setMsg((m) => ({ ...m, [id]: err instanceof Error ? err.message : "Save failed." }));
    } finally {
      setSavingId(null);
    }
  }

  const inputCls = "w-28 rounded-md border px-2 py-1 text-sm text-right";

  return (
    <AppShell>
      <div className="w-full">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Fee pricing</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Set tuition per class level for each registration mode. Operators pick the mode;
              these prices are applied automatically and can’t be edited by them.
            </p>
          </div>
          <Link
            href="/admin/fee-templates/new"
            className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            New template
          </Link>
        </div>

        {loading && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}
        {error && (
          <div className="mt-6 rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
            <p className="font-medium text-destructive">Couldn’t load fee templates</p>
            <p className="mt-1 text-muted-foreground">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="mt-6 w-full overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Class level</th>
                  <th className="px-4 py-2 text-left font-medium">Year</th>
                  <th className="px-4 py-2 text-left font-medium">Template</th>
                  <th className="px-4 py-2 text-right font-medium">Yearly</th>
                  <th className="px-4 py-2 text-right font-medium">Termly</th>
                  <th className="px-4 py-2 text-right font-medium">Monthly</th>
                  <th className="px-4 py-2 text-right font-medium">Save</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                      No fee templates found.
                    </td>
                  </tr>
                )}
                {rows.map((r) => {
                  const id = String(r.id);
                  const e = edits[id] ?? { yearly: "", termly: "", monthly: "" };
                  return (
                    <tr key={id} className="border-b last:border-0 align-middle">
                      <td className="px-4 py-2">{String(r.classLevel ?? r.classLevelCode ?? "—")}</td>
                      <td className="px-4 py-2">{String(r.academicYear ?? "—")}</td>
                      <td className="px-4 py-2">{String(r.name ?? "—")}</td>
                      <td className="px-4 py-2 text-right">
                        <input type="number" min={0} step="0.01" value={e.yearly}
                          disabled={savingId === id} className={inputCls}
                          onChange={(ev) => set(id, "yearly", ev.target.value)} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input type="number" min={0} step="0.01" value={e.termly}
                          disabled={savingId === id} className={inputCls}
                          onChange={(ev) => set(id, "termly", ev.target.value)} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input type="number" min={0} step="0.01" value={e.monthly}
                          disabled={savingId === id} className={inputCls}
                          onChange={(ev) => set(id, "monthly", ev.target.value)} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button size="sm" onClick={() => save(id)} disabled={savingId === id}>
                          {savingId === id ? "Saving…" : "Save"}
                        </Button>
                        {msg[id] && (
                          <div className={"mt-1 text-xs " + (msg[id] === "Saved." ? "text-green-600" : "text-destructive")}>
                            {msg[id]}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Monthly is the per-month price; Termly and Yearly are the full-period prices.
        </p>
      </div>
    </AppShell>
  );
}
