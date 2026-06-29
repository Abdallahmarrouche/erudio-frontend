// app/receipts/[id]/page.tsx
"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

const RECEIPTS_ENDPOINT = "/accounts/receipts";

function unwrap(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    for (const k of ["data", "receipt", "result", "item"]) {
      const inner = obj[k];
      if (inner && typeof inner === "object" && !Array.isArray(inner)) return inner as Record<string, unknown>;
    }
    return obj;
  }
  return null;
}
function money(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return "AED " + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function str(v: unknown): string {
  return v === undefined || v === null || v === "" ? "—" : String(v);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}

interface JournalLine {
  accountCode?: string;
  accountName?: string;
  debitAmount?: number;
  creditAmount?: number;
  description?: string;
}
interface JournalEntry {
  id?: string;
  journalNumber?: string;
  entryDate?: string;
  description?: string;
  status?: string;
  lines?: JournalLine[];
}

export default function ReceiptDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");

  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelMsg, setCancelMsg] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rRaw, jRaw] = await Promise.all([
        apiFetch(`${RECEIPTS_ENDPOINT}/${encodeURIComponent(id)}`),
        apiFetch(`${RECEIPTS_ENDPOINT}/${encodeURIComponent(id)}/journal`).catch(() => null),
      ]);
      setReceipt(unwrap(rRaw));
      const j = unwrap(jRaw);
      setJournal(Array.isArray(j?.journalEntries) ? (j!.journalEntries as JournalEntry[]) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load receipt");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function cancel() {
    setCancelMsg(null);
    if (reason.trim().length < 10) {
      setCancelMsg("Give a reason of at least 10 characters.");
      return;
    }
    setCancelling(true);
    try {
      await apiFetch(`${RECEIPTS_ENDPOINT}/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setReason("");
      await loadAll();
      setCancelMsg("Receipt cancelled and the journal reversed.");
    } catch (err) {
      setCancelMsg(err instanceof Error ? err.message : "Couldn’t cancel the receipt.");
    } finally {
      setCancelling(false);
    }
  }

  const isCancelled = !!receipt?.deletedAt;

  return (
    <AppShell>
      <Link href="/receipts" className="text-sm text-muted-foreground hover:underline">
        ← Back to receipts
      </Link>

      {loading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}

      {error && (
        <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Couldn’t load this receipt</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
        </div>
      )}

      {!loading && !error && receipt && (
        <>
          <div className="mt-3 flex items-center gap-3">
            <h1 className="text-2xl font-bold">{str(receipt.receiptNumber)}</h1>
            {isCancelled && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground line-through">
                cancelled
              </span>
            )}
          </div>

          <div className="mt-6 grid gap-x-8 gap-y-4 rounded-md border p-4 sm:grid-cols-2">
            <Field label="Amount">
              <span className="font-semibold">{money(receipt.amount)}</span>
            </Field>
            <Field label="Invoice">
              {receipt.invoiceId ? (
                <Link
                  href={`/invoices/${encodeURIComponent(String(receipt.invoiceId))}`}
                  className="text-primary underline underline-offset-2"
                >
                  {str(receipt.invoiceNumber)}
                </Link>
              ) : (
                str(receipt.invoiceNumber)
              )}
            </Field>
            <Field label="Parent">{str(receipt.parentName)}</Field>
            <Field label="Bank account">{str(receipt.bankAccountName)}</Field>
            <Field label="Payment method">{str(receipt.paymentMethod)}</Field>
            <Field label="Receipt date">{str(receipt.receiptDate)}</Field>
            <Field label="Reference">{str(receipt.reference)}</Field>
            {receipt.notes ? <Field label="Notes">{str(receipt.notes)}</Field> : null}
          </div>

          <h2 className="mb-3 mt-8 text-lg font-semibold">Journal</h2>
          {journal.length === 0 ? (
            <p className="text-sm text-muted-foreground">No journal entries.</p>
          ) : (
            <div className="space-y-4">
              {journal.map((e, i) => (
                <div key={e.id ?? i} className="overflow-x-auto rounded-md border">
                  <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2 text-sm">
                    <span className="font-medium">{str(e.journalNumber)}</span>
                    <span className="text-muted-foreground">
                      {str(e.entryDate)} · {str(e.status)}
                    </span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="px-4 py-2 text-left font-medium">Account</th>
                        <th className="px-4 py-2 text-right font-medium">Debit</th>
                        <th className="px-4 py-2 text-right font-medium">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(e.lines ?? []).map((l, li) => (
                        <tr key={li} className="border-b last:border-0">
                          <td className="px-4 py-2">
                            {str(l.accountCode)} — {str(l.accountName)}
                          </td>
                          <td className="px-4 py-2 text-right">{l.debitAmount ? money(l.debitAmount) : ""}</td>
                          <td className="px-4 py-2 text-right">{l.creditAmount ? money(l.creditAmount) : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {!isCancelled && (
            <div className="mt-8 rounded-md border border-destructive/30 p-4">
              <div className="text-sm font-medium">Cancel this receipt</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Reverses the journal and restores the invoice’s outstanding balance. This can’t be undone.
              </p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                disabled={cancelling}
                placeholder="Reason (min 10 characters)…"
                className="mt-2 w-full rounded-md border px-2 py-1.5 text-sm"
              />
              <div className="mt-2 flex items-center gap-3">
                <Button variant="outline" onClick={cancel} disabled={cancelling}>
                  {cancelling ? "Cancelling…" : "Cancel receipt"}
                </Button>
                {cancelMsg && <span className="text-sm text-muted-foreground">{cancelMsg}</span>}
              </div>
            </div>
          )}
          {isCancelled && cancelMsg && (
            <p className="mt-4 text-sm text-muted-foreground">{cancelMsg}</p>
          )}
        </>
      )}
    </AppShell>
  );
}
