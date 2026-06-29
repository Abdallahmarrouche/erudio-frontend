// components/payment-schedule-editor.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchList } from "@/lib/resource";
import { apiFetch } from "@/lib/api";

interface Row {
  id: string; // real id, or `new-N` for unsaved rows
  installmentNumber: number | string;
  dueDate: string;
  amount: string; // kept as string while editing
  status: string;
  invoiceId: string | null;
  isNew?: boolean;
  isDeleted?: boolean;
  origAmount?: string;
  origDueDate?: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-blue-100 text-blue-800",
  invoiced: "bg-green-100 text-green-800",
  paid: "bg-emerald-100 text-emerald-800",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status.toLowerCase()] ?? "bg-muted text-muted-foreground";
  return (
    <span className={"rounded-full px-2.5 py-0.5 text-xs font-medium " + cls}>
      {status}
    </span>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

export function PaymentScheduleEditor({
  studentId,
  hideHeading = false,
}: {
  studentId: string;
  hideHeading?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tmpCounter, setTmpCounter] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetchList(
        `/accounts/students/${encodeURIComponent(studentId)}/payment-schedule`
      );
      const mapped: Row[] = (res.rows as unknown as Record<string, unknown>[])
        .filter((r) => String(r.status) !== "cancelled")
        .map((r) => {
          const amount = String(r.amount ?? "");
          const dueDate = String(r.dueDate ?? "");
          return {
            id: String(r.id),
            installmentNumber: (r.installmentNumber as number) ?? "",
            dueDate,
            amount,
            status: String(r.status ?? "pending"),
            invoiceId: (r.invoiceId as string) ?? null,
            isNew: false,
            isDeleted: false,
            origAmount: amount,
            origDueDate: dueDate,
          };
        });
      setRows(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedule");
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  function editable(r: Row): boolean {
    return r.status === "pending" && !r.isDeleted;
  }

  function setFieldValue(id: string, field: "amount" | "dueDate", value: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  }

  function addRow() {
    const tmpId = `new-${tmpCounter}`;
    setTmpCounter((c) => c + 1);
    setRows((prev) => [
      ...prev,
      {
        id: tmpId,
        installmentNumber: "—",
        dueDate: today(),
        amount: "0",
        status: "pending",
        invoiceId: null,
        isNew: true,
        isDeleted: false,
      },
    ]);
  }

  function removeRow(id: string) {
    setRows((prev) =>
      prev.flatMap((r) => {
        if (r.id !== id) return [r];
        if (r.isNew) return [];
        return [{ ...r, isDeleted: true }];
      })
    );
  }

  function undoRemove(id: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isDeleted: false } : r))
    );
  }

  // "Spread evenly across non-zero pending rows" — lets the operator zero a
  // month and push its amount onto the rest. Keeps the visible total the same.
  function spreadEvenly() {
    const targets = rows.filter((r) => editable(r) && Number(r.amount) > 0);
    if (targets.length === 0) return;
    // Only pending rows participate — invoiced/paid amounts are never touched.
    const total = rows
      .filter((r) => editable(r))
      .reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const base = Math.round((total / targets.length) * 100) / 100;
    const ids = new Set(targets.map((t) => t.id));
    let assigned = 0;
    const lastId = targets[targets.length - 1].id;
    setRows((prev) =>
      prev.map((r) => {
        if (!ids.has(r.id)) return r;
        if (r.id === lastId) {
          return { ...r, amount: String(Math.round((total - assigned) * 100) / 100) };
        }
        assigned = Math.round((assigned + base) * 100) / 100;
        return { ...r, amount: String(base) };
      })
    );
  }

  const newRows = rows.filter((r) => r.isNew && !r.isDeleted);
  const editedRows = rows.filter(
    (r) =>
      !r.isNew &&
      !r.isDeleted &&
      r.status === "pending" &&
      (r.amount !== r.origAmount || r.dueDate !== r.origDueDate)
  );
  const deletedRows = rows.filter((r) => !r.isNew && r.isDeleted);
  const pendingChanges = newRows.length + editedRows.length + deletedRows.length;

  async function save() {
    if (pendingChanges === 0) return;
    setSaving(true);
    setMsg(null);

    const base = `/accounts/students/${encodeURIComponent(studentId)}/payment-schedule`;
    const calls: Promise<unknown>[] = [];

    for (const r of newRows) {
      calls.push(
        apiFetch(`${base}/installments`, {
          method: "POST",
          body: JSON.stringify({ amount: Number(r.amount), dueDate: r.dueDate }),
        })
      );
    }
    for (const r of editedRows) {
      calls.push(
        apiFetch(`${base}/${encodeURIComponent(r.id)}`, {
          method: "PUT",
          body: JSON.stringify({ amount: Number(r.amount), dueDate: r.dueDate }),
        })
      );
    }
    for (const r of deletedRows) {
      calls.push(
        apiFetch(`${base}/${encodeURIComponent(r.id)}`, { method: "DELETE" })
      );
    }

    const results = await Promise.allSettled(calls);
    const okCount = results.filter((r) => r.status === "fulfilled").length;
    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );

    await load();

    let m = `${okCount} change${okCount === 1 ? "" : "s"} saved.`;
    if (failures.length > 0) {
      const reason =
        failures[0].reason instanceof Error
          ? failures[0].reason.message
          : "unknown error";
      m += ` ${failures.length} failed — ${reason}`;
    }
    setMsg(m);
    setSaving(false);
  }

  const visibleTotal = rows
    .filter((r) => !r.isDeleted)
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  return (
    <div>
      {!hideHeading ? (
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Payment Schedule</h2>
          <span className="text-sm text-muted-foreground">
            Total: {visibleTotal.toLocaleString()}
          </span>
        </div>
      ) : (
        <div className="mb-2 flex justify-end">
          <span className="text-sm text-muted-foreground">
            Total: {visibleTotal.toLocaleString()}
          </span>
        </div>
      )}
      <p className="mb-3 text-sm text-muted-foreground">
        Pending installments are editable. Invoiced or paid installments are
        locked — change those by cancelling/crediting the invoice.
      </p>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Couldn’t load schedule</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <p className="mt-2 text-muted-foreground">
            A 404 on save means the schedule-edit endpoints aren’t deployed yet.
          </p>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Due Date</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Amount</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  if (r.isDeleted) {
                    return (
                      <tr key={r.id} className="border-b bg-destructive/5 last:border-0">
                        <td className="px-3 py-2 text-muted-foreground line-through">
                          {String(r.installmentNumber)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground line-through">
                          {r.dueDate}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground line-through">
                          {r.amount}
                        </td>
                        <td className="px-3 py-2 text-xs text-destructive">
                          will be removed
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button variant="ghost" size="sm" onClick={() => undoRemove(r.id)}>
                            Undo
                          </Button>
                        </td>
                      </tr>
                    );
                  }

                  const canEdit = editable(r);
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        {String(r.installmentNumber)}
                        {r.isNew && <span className="ml-1 text-xs text-blue-600">new</span>}
                      </td>
                      <td className="px-3 py-2">
                        {canEdit ? (
                          <Input
                            type="date"
                            value={r.dueDate}
                            onChange={(e) => setFieldValue(r.id, "dueDate", e.target.value)}
                            className="w-40"
                          />
                        ) : (
                          <span>{r.dueDate}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {canEdit ? (
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={r.amount}
                            onChange={(e) => setFieldValue(r.id, "amount", e.target.value)}
                            className="w-32"
                          />
                        ) : (
                          <span>{Number(r.amount).toLocaleString()}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {canEdit ? (
                          <Button variant="ghost" size="sm" onClick={() => removeRow(r.id)}>
                            Remove
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">🔒 locked</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                      No schedule yet. Generate one, or add installments below.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={addRow}>
              + Add installment
            </Button>
            <Button variant="outline" size="sm" onClick={spreadEvenly}>
              Spread evenly
            </Button>
            <Button onClick={save} disabled={saving || pendingChanges === 0}>
              Save changes
            </Button>
            <span className="text-sm text-muted-foreground">{pendingChanges} unsaved</span>
            {saving && <span className="text-sm text-muted-foreground">Saving…</span>}
            {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
          </div>
        </>
      )}
    </div>
  );
}
