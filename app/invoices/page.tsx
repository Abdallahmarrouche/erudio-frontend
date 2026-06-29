// app/invoices/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

const INVOICES_ENDPOINT = "/accounts/invoices";

// Columns the backend can sort on (listInvoices.allowedSort).
type SortKey = "invoiceNumber" | "issuedDate" | "dueDate" | "total" | "outstanding";
type SortDir = "asc" | "desc";

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

export default function InvoicesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>("dueDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc"); // latest on top

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all: Record<string, unknown>[] = [];
      for (let page = 1; page <= 50; page++) {
        const raw = await apiFetch(`${INVOICES_ENDPOINT}?sortBy=${sortBy}&sortDir=${sortDir}&page=${page}&pageSize=100`);
        const batch = toRows(raw);
        all.push(...batch);
        if (batch.length < 100) break;
      }
      setRows(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, [sortBy, sortDir]);

  useEffect(() => {
    load();
  }, [load]);

  function onSort(key: SortKey) {
    if (key === sortBy) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("desc");
    }
  }

  function SortableTh({ label, col, right }: { label: string; col: SortKey; right?: boolean }) {
    const active = sortBy === col;
    return (
      <th
        onClick={() => onSort(col)}
        className={
          "cursor-pointer select-none px-4 py-2 font-medium text-muted-foreground hover:text-foreground " +
          (right ? "text-right" : "text-left")
        }
      >
        {label}
        <span className="ml-1 text-xs">{active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>
      </th>
    );
  }

  return (
    <AppShell>
      <div className="w-full">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Invoices</h1>
          {!loading && !error && (
            <span className="text-sm text-muted-foreground">
              {rows.length} record{rows.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
            <p className="font-medium text-destructive">Couldn’t load invoices</p>
            <p className="mt-1 text-muted-foreground">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="w-full overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <SortableTh label="Invoice #" col="invoiceNumber" />
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Student</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                  <SortableTh label="Issued" col="issuedDate" />
                  <SortableTh label="Due" col="dueDate" />
                  <SortableTh label="Total" col="total" right />
                  <SortableTh label="Outstanding" col="outstanding" right />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                      No invoices.
                    </td>
                  </tr>
                )}
                {rows.map((r, i) => {
                  const student = obj(r.student);
                  const id = r.id ? String(r.id) : "";
                  return (
                    <tr
                      key={id || i}
                      onClick={() => id && router.push(`/invoices/${encodeURIComponent(id)}`)}
                      className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                    >
                      <td className="whitespace-nowrap px-4 py-2 font-medium">{String(r.invoiceNumber ?? "—")}</td>
                      <td className="px-4 py-2">{String(student.fullName ?? student.studentCode ?? "—")}</td>
                      <td className="px-4 py-2"><StatusBadge status={r.status as string | undefined} /></td>
                      <td className="whitespace-nowrap px-4 py-2">{String(r.issuedDate ?? "—")}</td>
                      <td className="whitespace-nowrap px-4 py-2">{String(r.dueDate ?? "—")}</td>
                      <td className="px-4 py-2 text-right">{money(r.total)}</td>
                      <td className="px-4 py-2 text-right">{money(r.outstanding)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && (
          <p className="mt-3 text-xs text-muted-foreground">
            Click a column header to sort; click again to flip direction. Click a row to open the invoice.
          </p>
        )}
      </div>
    </AppShell>
  );
}
