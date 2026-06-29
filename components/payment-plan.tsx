// components/payment-plan.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

const STUDENTS_ENDPOINT = "/accounts/students";

// ── Admin-allowed payment counts ────────────────────────────────────────────
const TERMLY_COUNTS = [1, 2, 3];
const YEARLY_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

type PlanType = "monthly" | "termly" | "yearly";

// ── helpers ─────────────────────────────────────────────────────────────────
function unwrap(raw: unknown, keys: string[]): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    for (const k of keys) {
      const inner = obj[k];
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        return inner as Record<string, unknown>;
      }
    }
    return obj;
  }
  return null;
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
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function money(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function hasTemplate(a: Record<string, unknown> | null): boolean {
  const ft = (a?.feeTemplate ?? null) as Record<string, unknown> | null;
  return !!(a && ft && ft.id && a.academicYearId);
}
// Next working day off the UAE Sat–Sun weekend, as YYYY-MM-DD.
function nextWorkingDayISO(): string {
  const d = new Date();
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  if (day === 6) d.setUTCDate(d.getUTCDate() + 2);
  else if (day === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function isoDate(v: unknown): string {
  const s = String(v ?? "");
  return s.length >= 10 ? s.slice(0, 10) : s;
}

interface Plan {
  id: string;
  name: string;
  planType: string;
  installmentCount?: number;
}
interface Item {
  feeType?: string;
  description?: string;
  amount?: number | string;
  vatApplicable?: boolean;
  vatRate?: number | string;
}

const ASSIGN_KEYS = ["data", "feeAssignment", "assignment", "fee", "result", "item"];

export function PaymentPlan({ studentId }: { studentId: string }) {
  const base = `${STUDENTS_ENDPOINT}/${encodeURIComponent(studentId)}`;

  const [assignment, setAssignment] = useState<Record<string, unknown> | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [schedule, setSchedule] = useState<Record<string, unknown>[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selType, setSelType] = useState<PlanType>("monthly");
  const [selCount, setSelCount] = useState<number>(3);
  const [dateEdits, setDateEdits] = useState<Record<string, string>>({});
  const [working, setWorking] = useState(false);
  const [savingDates, setSavingDates] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoaded(false);
    setError(null);
    try {
      const [pRaw, sRaw] = await Promise.all([
        apiFetch(`/shared/billing-plans`).catch(() => null),
        apiFetch(`${base}/payment-schedule`).catch(() => null),
      ]);
      setPlans(toRows(pRaw) as unknown as Plan[]);
      setSchedule(toRows(sRaw));
      setDateEdits({});

      let a = unwrap(await apiFetch(`${base}/fee-assignment`).catch(() => null), ASSIGN_KEYS);

      if (!hasTemplate(a)) {
        const years = toRows(await apiFetch(`/shared/academic-years`).catch(() => null));
        years.sort((x, y) => {
          const dx = String(x.startDate ?? x.start_date ?? "");
          const dy = String(y.startDate ?? y.start_date ?? "");
          return dx < dy ? 1 : dx > dy ? -1 : 0; // most recent first
        });
        for (const y of years) {
          const yid = y.id ?? y.academicYearId ?? y.academic_year_id;
          if (!yid) continue;
          const probe = unwrap(
            await apiFetch(`${base}/fee-assignment?academicYearId=${encodeURIComponent(String(yid))}`).catch(() => null),
            ASSIGN_KEYS
          );
          if (hasTemplate(probe)) {
            a = probe;
            break;
          }
        }
      }

      setAssignment(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoaded(true);
    }
  }, [base]);

  useEffect(() => {
    load();
  }, [load]);

  // ── derive fee items ──
  const feeTemplate = (assignment?.feeTemplate ?? null) as Record<string, unknown> | null;
  const items: Item[] = Array.isArray(feeTemplate?.items) ? (feeTemplate!.items as Item[]) : [];
  const tuitionItems = items.filter((i) => String(i.feeType ?? "").toLowerCase() === "tuition");
  const otherItems = items.filter((i) => String(i.feeType ?? "").toLowerCase() !== "tuition");
  const templateTuition = tuitionItems.reduce((s, i) => s + num(i.amount), 0);

  // Tuition now lives on the ASSIGNMENT (mode-specific price). Fall back to the
  // template's tuition line for un-migrated data.
  const storedTuition = assignment?.tuitionAmount != null ? num(assignment.tuitionAmount) : templateTuition;
  const storedMode = String(assignment?.registrationMode ?? "").toLowerCase();
  // Admin-set per-mode price off the fee template (read-only to the operator).
  const tmplPrice = (m: PlanType): number => {
    const ft = (assignment?.feeTemplate ?? {}) as Record<string, unknown>;
    const v = m === "yearly" ? ft.tuitionYearly : m === "termly" ? ft.tuitionTermly : ft.tuitionMonthly;
    return v != null ? num(v) : storedTuition;
  };
  const modePrice = tmplPrice(selType);
  const tuitionShown = modePrice;

  const dueNowSub = otherItems.reduce((s, i) => s + num(i.amount), 0);
  const dueNowVat = otherItems.reduce(
    (s, i) => s + (i.vatApplicable ? (num(i.amount) * num(i.vatRate)) / 100 : 0),
    0
  );
  const dueNowTotal = dueNowSub + dueNowVat;

  const hasAssignment = hasTemplate(assignment);
  const yearName = String(assignment?.academicYearName ?? "");

  // ── current plan → type + count ──
  const billingPlanId = String(assignment?.billingPlanId ?? "");
  const currentPlan = plans.find((p) => p.id === billingPlanId);
  const current = useMemo(() => {
    if (!currentPlan) return null;
    const t = String(currentPlan.planType).toLowerCase();
    const c = currentPlan.installmentCount ?? 0;
    if (t === "term_split") return { type: "termly" as PlanType, count: c, label: `Termly · ${c} payment${c === 1 ? "" : "s"}` };
    if (t === "full_upfront") return { type: "yearly" as PlanType, count: 1, label: "Yearly · 1 payment" };
    if (t === "monthly" && c === 1) return { type: "monthly" as PlanType, count: 1, label: "Monthly (month-to-month)" };
    if (t === "monthly") return { type: "yearly" as PlanType, count: c, label: `Yearly · ${c} payment${c === 1 ? "" : "s"}` };
    return { type: "monthly" as PlanType, count: c, label: currentPlan.name };
  }, [currentPlan]);

  // Seed the selectors from the STORED mode (preferred) + the plan's count.
  useEffect(() => {
    if (!assignment) return;
    const m = storedMode;
    if (m === "monthly" || m === "termly" || m === "yearly") setSelType(m as PlanType);
    else if (current) setSelType(current.type);
    if (current) setSelCount(current.count || (current?.type === "termly" ? 3 : current?.type === "yearly" ? 4 : 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment]);

  function resolvePlan(type: PlanType, count: number): Plan | undefined {
    const pt = (p: Plan) => String(p.planType).toLowerCase();
    if (type === "monthly")
      return plans.find((p) => pt(p) === "monthly" && p.installmentCount === 1);
    if (type === "termly")
      return plans.find((p) => pt(p) === "term_split" && p.installmentCount === count);
    // yearly
    if (count === 1) return plans.find((p) => pt(p) === "full_upfront");
    return plans.find((p) => pt(p) === "monthly" && p.installmentCount === count);
  }

  const effectiveCount = selType === "monthly" ? 1 : selCount;
  const targetPlan = resolvePlan(selType, effectiveCount);

  const planMatches = !!current && current.type === selType && current.count === effectiveCount;
  const modeChanged = !!storedMode && storedMode !== selType;
  const tuitionChanged = modePrice !== storedTuition;
  const dirty = !planMatches || modeChanged || tuitionChanged;

  async function apply() {
    if (!targetPlan) {
      setMsg("That plan isn’t seeded yet — run 04-billing-plans.sql first.");
      return;
    }
    if (!hasAssignment) {
      setMsg("This student has no fee assignment yet.");
      return;
    }
    const tuition = modePrice;
    if (tuition <= 0) {
      setMsg("Enter the tuition amount for this mode first.");
      return;
    }
    setWorking(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        academicYearId: assignment!.academicYearId,
        feeTemplateId: feeTemplate!.id,
        billingPlanId: targetPlan.id,
        registrationMode: selType,
        tuitionAmount: tuition,
      };
      const disc = num(
        assignment!.oneTimeDiscountAmount ??
          assignment!.oneTimeDiscount ??
          assignment!.one_time_discount_amount
      );
      if (disc > 0) {
        body.oneTimeDiscountAmount = disc;
        const reason = assignment!.oneTimeDiscountReason ?? assignment!.one_time_discount_reason;
        if (reason) body.oneTimeDiscountReason = reason;
      }
      const fd = assignment!.feeDiscountId ?? assignment!.fee_discount_id;
      if (fd) body.feeDiscountId = fd;

      await apiFetch(`${base}/fee-assignment`, { method: "PUT", body: JSON.stringify(body) });
      await apiFetch(`${base}/payment-schedule`, { method: "POST" });
      await load();
      setMsg("Saved — tuition schedule regenerated.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn’t save the plan");
    } finally {
      setWorking(false);
    }
  }

  // ── schedule view: cancelled rows are hidden and excluded from the total ──
  const visibleRows = schedule.filter((r) => String(r.status ?? "").toLowerCase() !== "cancelled");
  const visibleTotal = visibleRows.reduce((s, r) => s + num(r.amount), 0);

  function editedDate(r: Record<string, unknown>): string {
    const id = String(r.id ?? "");
    return dateEdits[id] ?? isoDate(r.dueDate);
  }
  const pendingDateChanges = visibleRows
    .filter((r) => String(r.status).toLowerCase() === "pending")
    .map((r) => ({ id: String(r.id ?? ""), dueDate: editedDate(r), original: isoDate(r.dueDate) }))
    .filter((e) => e.id && e.dueDate && e.dueDate !== e.original);

  async function saveDates() {
    if (pendingDateChanges.length === 0) {
      setMsg("No date changes to save.");
      return;
    }
    setSavingDates(true);
    setMsg(null);
    try {
      await apiFetch(`${base}/payment-schedule`, {
        method: "PUT",
        body: JSON.stringify({ installments: pendingDateChanges.map(({ id, dueDate }) => ({ id, dueDate })) }),
      });
      await load();
      setMsg("Due dates saved.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn’t save the dates");
    } finally {
      setSavingDates(false);
    }
  }

  if (!loaded) return <p className="text-sm text-muted-foreground">Loading payment plan…</p>;
  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
        <p className="font-medium text-destructive">Couldn’t load payment plan</p>
        <p className="mt-1 text-muted-foreground">{error}</p>
      </div>
    );
  }
  if (!hasAssignment) {
    return (
      <div className="rounded-md border p-4 text-sm text-muted-foreground">
        No fee assignment found for this student in any academic year yet. Assign a
        fee template first, then choose how tuition is paid.
      </div>
    );
  }

  const counts = selType === "termly" ? TERMLY_COUNTS : selType === "yearly" ? YEARLY_COUNTS : [];
  const dueNowDate = nextWorkingDayISO();

  return (
    <div className="space-y-6">
      {/* two-block math */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border p-4">
          <div className="text-sm font-medium text-muted-foreground">Tuition ({selType})</div>
          <div className="mt-1 text-2xl font-bold">AED {money(tuitionShown)}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            {modePrice > 0 ? (
              <>Set by admin for this class’s <strong>{selType}</strong> price. Split across the payments below.</>
            ) : (
              <span className="text-amber-600">
                No {selType} price set for this class yet — set it in Admin → Fee pricing.
              </span>
            )}
          </div>
        </div>
        <div className="rounded-md border p-4">
          <div className="text-sm font-medium text-muted-foreground">Due now (one-time)</div>
          <div className="mt-1 text-2xl font-bold">AED {money(dueNowTotal)}</div>
          <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {otherItems.map((i, idx) => (
              <div key={idx} className="flex justify-between">
                <span>{i.description ?? i.feeType}</span>
                <span>
                  AED {money(num(i.amount))}
                  {i.vatApplicable && num(i.vatRate) > 0 ? ` +${num(i.vatRate)}% VAT` : ""}
                </span>
              </div>
            ))}
            {otherItems.length === 0 && <div>No additional items.</div>}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Billed immediately — due {dueNowDate}.
          </div>
        </div>
      </div>

      {/* current + year */}
      <div className="text-sm">
        <span className="text-muted-foreground">Current plan: </span>
        <span className="font-medium">{current ? current.label : "none set"}</span>
        {yearName && <span className="ml-2 text-muted-foreground">· {yearName}</span>}
      </div>

      {/* type */}
      <div>
        <div className="mb-2 text-sm font-medium">Student registration mode</div>
        <div className="flex flex-wrap gap-2">
          {(["monthly", "termly", "yearly"] as PlanType[]).map((t) => (
            <Button
              key={t}
              size="sm"
              variant={selType === t ? "default" : "outline"}
              disabled={working}
              onClick={() => {
                setMsg(null);
                setSelType(t);
                if (t === "termly") setSelCount((c) => (TERMLY_COUNTS.includes(c) ? c : 3));
                if (t === "yearly") setSelCount((c) => (YEARLY_COUNTS.includes(c) ? c : 4));
              }}
            >
              {t === "monthly" ? "Monthly" : t === "termly" ? "Termly" : "Yearly"}
            </Button>
          ))}
        </div>
        {modeChanged && (
          <p className="mt-2 text-xs text-amber-600">
            Switching mode from <strong>{storedMode}</strong> to <strong>{selType}</strong>. Already-invoiced
            payments stay as they are; the new schedule covers what’s left. Add a discount for any overlap.
          </p>
        )}
        {selType === "monthly" && (
          <p className="mt-2 text-xs text-muted-foreground">
            Monthly is month-to-month — one payment for the coming month (one month of tuition).
          </p>
        )}
      </div>

      {/* count */}
      {counts.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-medium">How many payments?</div>
          <div className="flex flex-wrap gap-2">
            {counts.map((c) => (
              <Button
                key={c}
                size="sm"
                variant={selCount === c ? "default" : "outline"}
                disabled={working}
                onClick={() => {
                  setMsg(null);
                  setSelCount(c);
                }}
              >
                {c}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* apply */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={apply} disabled={working || !dirty || !targetPlan}>
          {working
            ? "Saving…"
            : !dirty
            ? "This is the current plan"
            : `Set ${selType === "monthly" ? "Monthly" : selType === "termly" ? `Termly · ${selCount}` : `Yearly · ${selCount}`}`}
        </Button>
        {!targetPlan && (
          <span className="text-xs text-destructive">No matching plan seeded — run 04-billing-plans.sql.</span>
        )}
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>

      {/* schedule */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-medium">
            Tuition schedule
            {currentPlan ? <span className="ml-2 font-normal text-muted-foreground">({currentPlan.name})</span> : null}
          </div>
          {pendingDateChanges.length > 0 && (
            <Button size="sm" variant="outline" onClick={saveDates} disabled={savingDates}>
              {savingDates ? "Saving dates…" : `Save ${pendingDateChanges.length} date change${pendingDateChanges.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </div>
        {visibleRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No schedule yet — pick a mode above and save to generate it.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Item</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Due date</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Amount</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r, idx) => {
                  const pending = String(r.status).toLowerCase() === "pending";
                  return (
                    <tr key={String(r.id ?? idx)} className="border-b last:border-0">
                      <td className="px-4 py-2">{String(r.installmentNumber ?? idx + 1)}</td>
                      <td className="px-4 py-2">
                        {String(
                          r.periodLabel ??
                            (String(r.kind) === "one_time"
                              ? r.description ?? r.feeType ?? "One-time"
                              : "Tuition")
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        {pending ? (
                          <input
                            type="date"
                            value={editedDate(r)}
                            disabled={savingDates || working}
                            onChange={(e) =>
                              setDateEdits((prev) => ({ ...prev, [String(r.id)]: e.target.value }))
                            }
                            className="rounded-md border px-2 py-1 text-sm"
                          />
                        ) : (
                          isoDate(r.dueDate) || "—"
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">AED {money(num(r.amount))}</td>
                      <td className="px-4 py-2">
                        <span className={String(r.status) === "invoiced" ? "text-muted-foreground" : "font-medium"}>
                          {String(r.status ?? "—")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t bg-muted/30">
                <tr>
                  <td className="px-4 py-2 font-medium" colSpan={3}>Total (excl. cancelled)</td>
                  <td className="px-4 py-2 text-right font-medium">AED {money(visibleTotal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
