// components/record-receipt.tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

const RECEIPTS_ENDPOINT = "/accounts/receipts";
const BANK_ACCOUNTS_ENDPOINT = "/shared/bank-accounts";

const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "online", label: "Online" },
] as const;

interface BankAccount {
  id: string;
  accountName?: string;
  bankName?: string;
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
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RecordReceipt({
  invoiceId,
  parentId,
  outstanding,
  onRecorded,
}: {
  invoiceId: string;
  parentId: string;
  outstanding: number;
  onRecorded?: () => void;
}) {
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [amount, setAmount] = useState<string>(outstanding > 0 ? String(outstanding) : "");
  const [paymentMethod, setPaymentMethod] = useState<string>("bank_transfer");
  const [receiptDate, setReceiptDate] = useState<string>(todayISO());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await apiFetch(BANK_ACCOUNTS_ENDPOINT).catch(() => null);
      if (cancelled) return;
      const rows = toRows(raw) as unknown as BankAccount[];
      setBanks(rows);
      if (rows[0]?.id) setBankAccountId(rows[0].id);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit() {
    setMsg(null);
    setOk(false);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setMsg("Enter an amount greater than 0.");
    if (amt > outstanding) return setMsg(`Amount can’t exceed the outstanding balance (AED ${outstanding.toFixed(2)}).`);
    if (!bankAccountId) return setMsg("Choose the bank account the money landed in.");
    if (!receiptDate) return setMsg("Pick the receipt date.");

    setWorking(true);
    try {
      const body = {
        invoiceId,
        parentId,
        bankAccountId,
        amount: amt,
        paymentMethod,
        receiptDate,
        ...(reference ? { reference } : {}),
        ...(notes ? { notes } : {}),
      };
      const res = (await apiFetch(RECEIPTS_ENDPOINT, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(body),
      })) as Record<string, unknown>;
      setOk(true);
      setMsg(
        `Recorded ${String(res.receiptNumber ?? "")} — invoice is now ${String(res.invoiceStatus ?? "updated")}.`
      );
      setReference("");
      setNotes("");
      onRecorded?.();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn’t record the receipt.");
    } finally {
      setWorking(false);
    }
  }

  if (outstanding <= 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This invoice is fully paid — nothing left to receipt against.
      </p>
    );
  }

  const inputCls = "w-full rounded-md border px-2 py-1.5 text-sm";

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="text-sm font-medium">Record a receipt</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Amount (AED)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            disabled={working}
            onChange={(e) => setAmount(e.target.value)}
            className={inputCls}
          />
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Outstanding: AED {outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Bank account</span>
          <select
            value={bankAccountId}
            disabled={working}
            onChange={(e) => setBankAccountId(e.target.value)}
            className={inputCls}
          >
            {banks.length === 0 && <option value="">No bank accounts found</option>}
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {[b.accountName, b.bankName].filter(Boolean).join(" — ") || b.id}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Payment method</span>
          <select
            value={paymentMethod}
            disabled={working}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className={inputCls}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Receipt date</span>
          <input
            type="date"
            value={receiptDate}
            max={todayISO()}
            disabled={working}
            onChange={(e) => setReceiptDate(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-muted-foreground">Reference (optional)</span>
          <input
            type="text"
            value={reference}
            maxLength={150}
            disabled={working}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Cheque no., transfer ref…"
            className={inputCls}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-muted-foreground">Notes (optional)</span>
          <textarea
            value={notes}
            maxLength={1000}
            disabled={working}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={inputCls}
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={working}>
          {working ? "Recording…" : "Record receipt"}
        </Button>
        {msg && (
          <span className={"text-sm " + (ok ? "text-green-600" : "text-destructive")}>{msg}</span>
        )}
      </div>
    </div>
  );
}
