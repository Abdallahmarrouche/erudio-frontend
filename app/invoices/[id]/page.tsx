// app/invoices/[id]/page.tsx
"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DataTable } from "@/components/data-table";
import { apiFetch } from "@/lib/api";
import { RecordReceipt } from "@/components/record-receipt";

const INVOICES_ENDPOINT = "/accounts/invoices";

interface Invoice {
  invoiceNumber?: string;
  status?: string;
  parentId?: string;
  studentId?: string;
  description?: string;
  lineItems?: Record<string, unknown>[];
  subtotal?: number;
  discountAmount?: number;
  vatAmount?: number;
  total?: number;
  paid?: number;
  issuedDate?: string;
  dueDate?: string;
  notes?: string;
}

function unwrap(raw: unknown): Invoice | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    for (const k of ["data", "invoice", "result", "item"]) {
      const inner = obj[k];
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        return inner as Invoice;
      }
    }
    return obj as Invoice;
  }
  return null;
}

function money(n: unknown): string {
  if (typeof n !== "number") return "—";
  return (
    "AED " +
    n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
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

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-green-100 text-green-800",
  issued: "bg-blue-100 text-blue-800",
  partial: "bg-amber-100 text-amber-800",
  partially_paid: "bg-amber-100 text-amber-800",
  overdue: "bg-red-100 text-red-800",
  draft: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground line-through",
};

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const cls =
    STATUS_STYLES[status.toLowerCase()] ?? "bg-muted text-muted-foreground";
  return (
    <span className={"rounded-full px-2.5 py-0.5 text-xs font-medium " + cls}>
      {status}
    </span>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}

function TotalRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      className={
        "flex justify-between " + (bold ? "font-semibold" : "text-muted-foreground")
      }
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [receipts, setReceipts] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [raw, rcpt] = await Promise.all([
        apiFetch(`${INVOICES_ENDPOINT}/${encodeURIComponent(id)}`),
        apiFetch(`/accounts/receipts?invoiceId=${encodeURIComponent(id)}`).catch(() => null),
      ]);
      setInvoice(unwrap(raw));
      setReceipts(toRows(rcpt));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoice");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload]);

  return (
    <AppShell>
      <Link
        href="/invoices"
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Back to invoices
      </Link>

      {loading && (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">
            Couldn’t load this invoice
          </p>
          <p className="mt-1 text-muted-foreground">{error}</p>
        </div>
      )}

      {!loading && !error && invoice && (
        <>
          <div className="mt-3 flex items-center gap-3">
            <h1 className="text-2xl font-bold">
              {invoice.invoiceNumber ?? "Invoice"}
            </h1>
            <StatusBadge status={invoice.status} />
          </div>

          <div className="mt-6 grid gap-x-8 gap-y-4 rounded-md border p-4 sm:grid-cols-2">
            <Field label="Student">
              {invoice.studentId ? (
                <Link
                  href={`/students/${encodeURIComponent(invoice.studentId)}`}
                  className="text-primary underline underline-offset-2"
                >
                  View student
                </Link>
              ) : (
                "—"
              )}
            </Field>
            <Field label="Parent">
              {invoice.parentId ? (
                <Link
                  href={`/parents/${encodeURIComponent(invoice.parentId)}`}
                  className="text-primary underline underline-offset-2"
                >
                  View parent
                </Link>
              ) : (
                "—"
              )}
            </Field>
            <Field label="Description">{invoice.description ?? "—"}</Field>
            <Field label="Issued">{invoice.issuedDate ?? "—"}</Field>
            <Field label="Due">{invoice.dueDate ?? "—"}</Field>
            {invoice.notes ? (
              <Field label="Notes">{invoice.notes}</Field>
            ) : null}
          </div>

          <h2 className="mb-3 mt-8 text-lg font-semibold">Line Items</h2>
          <DataTable rows={invoice.lineItems ?? []} />

          <div className="mt-6 flex justify-end">
            <div className="w-full max-w-xs space-y-1 text-sm">
              <TotalRow label="Subtotal" value={money(invoice.subtotal)} />
              <TotalRow label="Discount" value={money(invoice.discountAmount)} />
              <TotalRow label="VAT" value={money(invoice.vatAmount)} />
              <TotalRow label="Total" value={money(invoice.total)} bold />
              <TotalRow label="Paid" value={money(invoice.paid)} />
              <TotalRow
                label="Outstanding"
                value={money((invoice.total ?? 0) - (invoice.paid ?? 0))}
                bold
              />
            </div>
          </div>

          <h2 className="mb-3 mt-8 text-lg font-semibold">Receipts</h2>
          {receipts.length > 0 ? (
            <div className="mb-4 overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Receipt</th>
                    <th className="px-4 py-2 text-left font-medium">Date</th>
                    <th className="px-4 py-2 text-left font-medium">Method</th>
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        {r.id ? (
                          <Link
                            href={`/receipts/${encodeURIComponent(String(r.id))}`}
                            className="text-primary underline underline-offset-2"
                          >
                            {String(r.receiptNumber ?? "view")}
                          </Link>
                        ) : (
                          String(r.receiptNumber ?? "—")
                        )}
                      </td>
                      <td className="px-4 py-2">{String(r.receiptDate ?? "—")}</td>
                      <td className="px-4 py-2">{String(r.paymentMethod ?? "—")}</td>
                      <td className="px-4 py-2 text-right">{money(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mb-4 text-sm text-muted-foreground">No receipts recorded yet.</p>
          )}

          {invoice.parentId && (invoice.status ?? "").toLowerCase() !== "cancelled" ? (
            <RecordReceipt
              invoiceId={id}
              parentId={String(invoice.parentId)}
              outstanding={(invoice.total ?? 0) - (invoice.paid ?? 0)}
              onRecorded={reload}
            />
          ) : null}

          <p className="mt-8 text-xs text-muted-foreground">Invoice ID: {id}</p>
        </>
      )}
    </AppShell>
  );
}
