// app/receipts/page.tsx
"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DataTable } from "@/components/data-table";
import { apiFetch } from "@/lib/api";

const RECEIPTS_ENDPOINT = "/accounts/receipts";

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
function money(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return "AED " + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

// Flatten the nested list shape into primitive cells the table can render.
function flatten(r: Record<string, unknown>) {
  const parent = obj(r.parent);
  const invoice = obj(r.invoice);
  return {
    id: r.id,
    receiptNumber: r.receiptNumber,
    parent: parent.fullName ?? parent.parentCode ?? "—",
    invoice: invoice.invoiceNumber ?? "—",
    amount: money(r.amount),
    method: r.paymentMethod,
    date: r.receiptDate,
    bankAccount: r.bankAccountName ?? "—",
    reference: r.reference ?? "—",
  };
}

export default function ReceiptsPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const raw = await apiFetch(RECEIPTS_ENDPOINT);
        if (cancelled) return;
        setRows(toRows(raw).map(flatten));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load receipts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Receipts</h1>
        {!loading && !error && (
          <span className="text-sm text-muted-foreground">
            {rows.length} record{rows.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Couldn’t load receipts</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          <DataTable
            rows={rows}
            getRowHref={(row) => {
              const id = row.id;
              return id ? `/receipts/${encodeURIComponent(String(id))}` : null;
            }}
          />
          <p className="mt-3 text-xs text-muted-foreground">Click a row to open the receipt.</p>
        </>
      )}
    </AppShell>
  );
}
