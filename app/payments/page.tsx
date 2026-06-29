// app/payments/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { fetchList } from "@/lib/resource";

const STUDENTS_ENDPOINT = "/accounts/students";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function money(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function newIdempotencyKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
function getId(row: Record<string, unknown>): string | null {
  for (const f of ["id", "studentId", "student_id", "Id", "ID"]) {
    const v = row[f];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return null;
}
function getName(row: Record<string, unknown>): string {
  for (const k of ["fullName", "full_name", "name", "studentName"]) {
    if (typeof row[k] === "string" && row[k]) return row[k] as string;
  }
  return "Student";
}
function toRows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const k of ["data", "items", "installments", "schedule", "results", "records", "rows", "value"]) {
      if (Array.isArray(obj[k])) return obj[k] as Record<string, unknown>[];
    }
  }
  return [];
}

interface DueRow {
  studentId: string;
  studentName: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  item: string;
  oneTime: boolean;
  createdAt: string;
  scheduleId: string;
}

type SortKey = "studentName" | "item" | "installmentNumber" | "dueDate" | "amount" | "createdAt";

export default function PaymentsPage() {
  const [dueBefore, setDueBefore] = useState(today());
  const [rows, setRows] = useState<DueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [rowMsg, setRowMsg] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [invoicing, setInvoicing] = useState(false);
  const [combineMsg, setCombineMsg] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "createdAt", dir: "desc" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRowMsg({});
    try {
      const list = await fetchList(STUDENTS_ENDPOINT);
      const students = list.rows
        .map((r) => ({ id: getId(r), name: getName(r) }))
        .filter((s): s is { id: string; name: string } => !!s.id);

      const cutoff = new Date(dueBefore);
      const all: DueRow[] = [];

      // Fetch each student's schedule; keep pending rows due on/before the cutoff.
      const results = await Promise.all(
        students.map(async (s) => {
          try {
            const raw = await apiFetch(
              `${STUDENTS_ENDPOINT}/${encodeURIComponent(s.id)}/payment-schedule`
            );
            return { s, sched: toRows(raw) };
          } catch {
            return { s, sched: [] as Record<string, unknown>[] };
          }
        })
      );

      for (const { s, sched } of results) {
        for (const r of sched) {
          if (String(r.status) !== "pending") continue;
          const d = String(r.dueDate ?? r.due_date ?? "");
          if (!d) continue;
          if (new Date(d) > cutoff) continue;
          const kind = String(r.kind ?? "");
          const oneTime = kind === "one_time" || (!!r.feeType && String(r.feeType) !== "installment");
          const item = String(
            r.periodLabel ??
              (oneTime
                ? r.description ?? r.feeType ?? "One-time"
                : `Tuition #${num(r.installmentNumber ?? r.installment_number)}`)
          );
          all.push({
            studentId: s.id,
            studentName: s.name,
            installmentNumber: num(r.installmentNumber ?? r.installment_number),
            dueDate: d,
            amount: num(r.amount),
            item,
            oneTime,
            createdAt: String(r.createdAt ?? ""),
            scheduleId: String(r.id ?? ""),
          });
        }
      }

      // Newest-created first; tie-break by earliest due date.
      all.sort((a, b) => {
        if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
        return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
      });
      setRows(all);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pending payments");
    } finally {
      setLoading(false);
    }
  }, [dueBefore]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(row: DueRow) {
    const key = `${row.studentId}:${row.installmentNumber}`;
    setRunningKey(key);
    setRowMsg((m) => ({ ...m, [key]: "" }));
    try {
      // Raises invoices for this student's pending installments due on/before
      // this row's due date (processed in date order). Each becomes its own
      // invoice and posts to the ledger.
      await apiFetch(
        `${STUDENTS_ENDPOINT}/${encodeURIComponent(row.studentId)}/generate-invoices?dueBefore=${row.dueDate}`,
        { method: "POST", headers: { "Idempotency-Key": newIdempotencyKey() } }
      );
      await load();
    } catch (err) {
      setRowMsg((m) => ({
        ...m,
        [key]: err instanceof Error ? err.message : "Run failed",
      }));
    } finally {
      setRunningKey(null);
    }
  }

  function toggle(scheduleId: string) {
    setCombineMsg(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(scheduleId)) next.delete(scheduleId);
      else next.add(scheduleId);
      return next;
    });
  }

  async function invoiceSelected() {
    const picked = rows.filter((r) => selected.has(r.scheduleId) && r.scheduleId);
    if (picked.length === 0) return;
    setInvoicing(true);
    setCombineMsg(null);
    try {
      // One combined invoice per student (the endpoint is per-student).
      const byStudent = new Map<string, string[]>();
      for (const r of picked) {
        const arr = byStudent.get(r.studentId) ?? [];
        arr.push(r.scheduleId);
        byStudent.set(r.studentId, arr);
      }
      let invoices = 0;
      for (const [studentId, scheduleRowIds] of byStudent) {
        await apiFetch(
          `${STUDENTS_ENDPOINT}/${encodeURIComponent(studentId)}/generate-combined-invoice`,
          {
            method: "POST",
            headers: { "Idempotency-Key": newIdempotencyKey() },
            body: JSON.stringify({ scheduleRowIds }),
          }
        );
        invoices++;
      }
      setCombineMsg(
        `Created ${invoices} invoice${invoices === 1 ? "" : "s"} from ${picked.length} item${picked.length === 1 ? "" : "s"}.`
      );
      await load();
    } catch (err) {
      setCombineMsg(err instanceof Error ? err.message : "Couldn’t create the combined invoice.");
    } finally {
      setInvoicing(false);
    }
  }

  const total = rows.reduce((s, r) => s + r.amount, 0);

  function clickSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "amount" || key === "installmentNumber" || key === "createdAt" ? "desc" : "asc" }
    );
  }

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    const { key, dir } = sort;
    const mul = dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let cmp = 0;
      switch (key) {
        case "amount": cmp = a.amount - b.amount; break;
        case "installmentNumber": cmp = a.installmentNumber - b.installmentNumber; break;
        case "createdAt": cmp = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0; break;
        case "dueDate": cmp = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0; break;
        default: cmp = String(a[key]).localeCompare(String(b[key]));
      }
      cmp *= mul;
      // Stable tiebreak: newest-created first.
      if (cmp === 0) cmp = a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
      return cmp;
    });
    return arr;
  }, [rows, sort]);

  const arrow = (k: SortKey) => (sort.key === k ? (sort.dir === "asc" ? " ▲" : " ▼") : "");

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Payments due</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tuition installments that have reached their due date. Run one to raise its invoice.
          </p>
        </div>
        <label className="text-sm">
          <span className="mr-2 text-muted-foreground">Due on or before</span>
          <input
            type="date"
            value={dueBefore}
            onChange={(e) => setDueBefore(e.target.value)}
            className="rounded-md border bg-background px-2 py-1 text-sm"
          />
        </label>
      </div>

      {!loading && !error && rows.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={invoiceSelected} disabled={invoicing || selected.size === 0}>
            {invoicing ? "Invoicing…" : `Invoice selected${selected.size ? ` (${selected.size})` : ""}`}
          </Button>
          <span className="text-xs text-muted-foreground">
            Tick items to raise them together — one invoice per student.
          </span>
          {combineMsg && <span className="text-xs font-medium">{combineMsg}</span>}
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Couldn’t load payments</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="rounded-md border p-6 text-sm text-muted-foreground">
          Nothing due as of {dueBefore}. When a tuition installment’s due date arrives,
          it shows up here.
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground"></th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                  <button type="button" onClick={() => clickSort("studentName")} className="inline-flex items-center hover:text-foreground">Student{arrow("studentName")}</button>
                </th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                  <button type="button" onClick={() => clickSort("item")} className="inline-flex items-center hover:text-foreground">Item{arrow("item")}</button>
                </th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                  <button type="button" onClick={() => clickSort("installmentNumber")} className="inline-flex items-center hover:text-foreground">Installment{arrow("installmentNumber")}</button>
                </th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                  <button type="button" onClick={() => clickSort("dueDate")} className="inline-flex items-center hover:text-foreground">Due date{arrow("dueDate")}</button>
                </th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                  <button type="button" onClick={() => clickSort("amount")} className="inline-flex items-center hover:text-foreground">Amount{arrow("amount")}</button>
                </th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => {
                const key = `${r.studentId}:${r.installmentNumber}`;
                return (
                  <tr key={key} className="border-b last:border-0 align-top">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(r.scheduleId)}
                        disabled={!r.scheduleId || invoicing}
                        onChange={() => toggle(r.scheduleId)}
                        aria-label="Select for combined invoice"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/students/${encodeURIComponent(r.studentId)}`}
                        className="hover:underline"
                      >
                        {r.studentName}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <span>{r.item}</span>
                      {r.oneTime && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                          due now
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">#{r.installmentNumber}</td>
                    <td className="whitespace-nowrap px-4 py-2">{r.dueDate}</td>
                    <td className="px-4 py-2 text-right">AED {money(r.amount)}</td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" onClick={() => run(r)} disabled={runningKey !== null}>
                        {runningKey === key ? "Running…" : "Run"}
                      </Button>
                      {rowMsg[key] && (
                        <div className="mt-1 max-w-[18rem] text-xs text-destructive">
                          {rowMsg[key]}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t bg-muted/30">
              <tr>
                <td className="px-4 py-2 font-medium" colSpan={5}>
                  {rows.length} payment{rows.length === 1 ? "" : "s"} due
                </td>
                <td className="px-4 py-2 text-right font-medium">AED {money(total)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Running a payment raises an invoice for that student’s tuition installments due on
        or before the selected date and posts them to the ledger. If a run fails with an
        “accounting period” error, open that month’s period in Admin → Accounting periods first.
      </p>
    </AppShell>
  );
}
