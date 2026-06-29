// app/balances/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

const INVOICES_ENDPOINT = "/accounts/invoices";

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
function money(v: unknown): string {
  return "AED " + num(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-green-100 text-green-800",
  pending: "bg-blue-100 text-blue-800",
  issued: "bg-blue-100 text-blue-800",
  partial: "bg-amber-100 text-amber-800",
  partially_paid: "bg-amber-100 text-amber-800",
  overdue: "bg-red-100 text-red-800",
  draft: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground line-through",
  credit_noted: "bg-muted text-muted-foreground",
};
function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const cls = STATUS_STYLES[status.toLowerCase()] ?? "bg-muted text-muted-foreground";
  return <span className={"rounded-full px-2.5 py-0.5 text-xs font-medium " + cls}>{status}</span>;
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-md border p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={"mt-1 text-xl font-bold " + (accent ?? "")}>{value}</div>
    </div>
  );
}

export default function BalancesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unpaidOnly, setUnpaidOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const all: Record<string, unknown>[] = [];
        for (let page = 1; page <= 50; page++) {
          const raw = await apiFetch(`${INVOICES_ENDPOINT}?sortBy=dueDate&sortDir=desc&page=${page}&pageSize=100`);
          const batch = toRows(raw);
          all.push(...batch);
          if (batch.length < 100) break;
        }
        if (!cancelled) setRows(all);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load balances");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    const live = rows.filter((r) => {
      const s = String(r.status ?? "").toLowerCase();
      return s !== "cancelled" && s !== "credit_noted" && s !== "draft";
    });
    return unpaidOnly ? live.filter((r) => num(r.outstanding ?? num(r.total) - num(r.paid)) > 0.0001) : live;
  }, [rows, unpaidOnly]);

  const totals = useMemo(() => {
    let invoiced = 0, paid = 0, outstanding = 0;
    for (const r of visible) {
      invoiced += num(r.total);
      paid += num(r.paid);
      outstanding += num(r.outstanding ?? num(r.total) - num(r.paid));
    }
    return { invoiced, paid, outstanding };
  }, [visible]);

  return (
    <AppShell>
      <div className="w-full">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Balances</h1>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={unpaidOnly}
              onChange={(e) => setUnpaidOnly(e.target.checked)}
            />
            Unpaid only
          </label>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
            <p className="font-medium text-destructive">Couldn’t load balances</p>
            <p className="mt-1 text-muted-foreground">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <SummaryCard label="Invoiced" value={money(totals.invoiced)} />
              <SummaryCard label="Paid (receipts)" value={money(totals.paid)} accent="text-green-700" />
              <SummaryCard
                label="Outstanding (dues)"
                value={money(totals.outstanding)}
                accent={totals.outstanding > 0 ? "text-red-600" : ""}
              />
            </div>

            <div className="w-full overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Parent</th>
                    <th className="px-4 py-2 text-left font-medium">Student</th>
                    <th className="px-4 py-2 text-left font-medium">Invoice #</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">Due</th>
                    <th className="px-4 py-2 text-right font-medium">Total</th>
                    <th className="px-4 py-2 text-right font-medium">Paid</th>
                    <th className="px-4 py-2 text-right font-medium">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                        {unpaidOnly ? "Nothing outstanding." : "No invoices."}
                      </td>
                    </tr>
                  )}
                  {visible.map((r, i) => {
                    const parent = obj(r.parent);
                    const student = obj(r.student);
                    const id = r.id ? String(r.id) : "";
                    const outstanding = num(r.outstanding ?? num(r.total) - num(r.paid));
                    return (
                      <tr
                        key={id || i}
                        onClick={() => id && router.push(`/invoices/${encodeURIComponent(id)}`)}
                        className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                      >
                        <td className="px-4 py-2">{String(parent.fullName ?? parent.parentCode ?? "—")}</td>
                        <td className="px-4 py-2">{String(student.fullName ?? student.studentCode ?? "—")}</td>
                        <td className="whitespace-nowrap px-4 py-2 font-medium">{String(r.invoiceNumber ?? "—")}</td>
                        <td className="px-4 py-2"><StatusBadge status={r.status as string | undefined} /></td>
                        <td className="whitespace-nowrap px-4 py-2">{String(r.dueDate ?? "—")}</td>
                        <td className="px-4 py-2 text-right">{money(r.total)}</td>
                        <td className="px-4 py-2 text-right text-green-700">{money(r.paid)}</td>
                        <td className={"px-4 py-2 text-right font-medium " + (outstanding > 0 ? "text-red-600" : "text-muted-foreground")}>
                          {money(outstanding)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Click a row to open the invoice and record a receipt against it.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
