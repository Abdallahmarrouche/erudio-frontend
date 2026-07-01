// components/payment-plan.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

const STUDENTS_ENDPOINT = "/accounts/students";

const TERMLY_COUNTS = [1, 2, 3];
const YEARLY_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

type PlanType = "monthly" | "termly" | "yearly";

// Tuition grid axes (start is always 08:00; band is the end time).
const BANDS: { code: string; label: string }[] = [
  { code: "12:30", label: "8:00 AM – 12:30 PM" },
  { code: "14:00", label: "8:00 AM – 2:00 PM" },
  { code: "15:00", label: "8:00 AM – 3:00 PM" },
  { code: "16:00", label: "8:00 AM – 4:00 PM" },
  { code: "17:00", label: "8:00 AM – 5:00 PM" },
  { code: "18:00", label: "8:00 AM – 6:00 PM" },
];

// ── helpers ─────────────────────────────────────────────────────────────────
function unwrap(raw: unknown, keys: string[]): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    for (const k of keys) {
      const inner = obj[k];
      if (inner && typeof inner === "object" && !Array.isArray(inner)) return inner as Record<string, unknown>;
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
function isoDate(v: unknown): string {
  const s = String(v ?? "");
  return s.length >= 10 ? s.slice(0, 10) : s;
}
function nextWorkingDayISO(): string {
  const d = new Date();
  const day = d.getUTCDay();
  if (day === 6) d.setUTCDate(d.getUTCDate() + 2);
  else if (day === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function hasTemplate(a: Record<string, unknown> | null): boolean {
  const ft = (a?.feeTemplate ?? null) as Record<string, unknown> | null;
  return !!(a && ft && ft.id && a.academicYearId);
}

interface Plan { id: string; name: string; planType: string; installmentCount?: number }
interface GridCell { timingBand: string; daysPerWeek: number; mode: string; amount: number }
interface Item { feeType?: string; description?: string; amount?: number | string; vatApplicable?: boolean; vatRate?: number | string }

const ASSIGN_KEYS = ["data", "feeAssignment", "assignment", "fee", "result", "item"];

export function PaymentPlan({ studentId }: { studentId: string }) {
  const base = `${STUDENTS_ENDPOINT}/${encodeURIComponent(studentId)}`;

  const [years, setYears] = useState<Record<string, unknown>[]>([]);
  const [yearId, setYearId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [templateItems, setTemplateItems] = useState<Item[]>([]);
  const [grid, setGrid] = useState<GridCell[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [assignment, setAssignment] = useState<Record<string, unknown> | null>(null);
  const [schedule, setSchedule] = useState<Record<string, unknown>[]>([]);

  const [selBand, setSelBand] = useState<string>("12:30");
  const [selDays, setSelDays] = useState<number>(5);
  const [selType, setSelType] = useState<PlanType>("monthly");
  const [selCount, setSelCount] = useState<number>(3);

  const [dateEdits, setDateEdits] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [savingDates, setSavingDates] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Load years once, default to current.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ys = toRows(await apiFetch(`/shared/academic-years`).catch(() => null));
      if (cancelled) return;
      ys.sort((a, b) => {
        const da = String(a.startDate ?? a.start_date ?? "");
        const db = String(b.startDate ?? b.start_date ?? "");
        return da < db ? 1 : da > db ? -1 : 0;
      });
      setYears(ys);
      const cur = ys.find((y) => y.isCurrent === true || y.is_current === true || y.is_current === 1) ?? ys[0];
      setYearId(String(cur?.id ?? cur?.academicYearId ?? ""));
    })();
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async () => {
    if (!yearId) return;
    setLoaded(false);
    setError(null);
    try {
      const [pRaw, sRaw, tRaw, gRaw, aRaw] = await Promise.all([
        apiFetch(`/shared/billing-plans`).catch(() => null),
        apiFetch(`${base}/payment-schedule`).catch(() => null),
        apiFetch(`/accounts/fee-templates`).catch(() => null),
        apiFetch(`/shared/tuition-pricing?academicYearId=${encodeURIComponent(yearId)}`).catch(() => null),
        apiFetch(`${base}/fee-assignment?academicYearId=${encodeURIComponent(yearId)}`).catch(() => null),
      ]);
      setPlans(toRows(pRaw) as unknown as Plan[]);
      setSchedule(toRows(sRaw));
      setDateEdits({});
      setGrid(
        toRows(gRaw).map((r) => ({
          timingBand: String(r.timingBand ?? r.timing_band ?? ""),
          daysPerWeek: num(r.daysPerWeek ?? r.days_per_week),
          mode: String(r.mode ?? ""),
          amount: num(r.amount),
        }))
      );

      // Pick the template for this year (there is one class-agnostic template).
      const templates = toRows(tRaw);
      const forYear = templates.find(
        (t) => String(t.academicYearId ?? t.academic_year_id ?? "") === yearId
      );
      const chosen = forYear ?? templates[0] ?? null;
      setTemplateId(String(chosen?.id ?? ""));

      const a = unwrap(aRaw, ASSIGN_KEYS);
      setAssignment(a);

      // ancillary items: prefer the assignment's template, else the chosen template
      const ftItems = (a?.feeTemplate as Record<string, unknown> | undefined)?.items;
      const chItems = (chosen?.items as unknown) ?? null;
      const rawItems = Array.isArray(ftItems) ? ftItems : Array.isArray(chItems) ? chItems : [];
      setTemplateItems(rawItems as Item[]);

      // seed selectors from a stored assignment
      const storedMode = String(a?.registrationMode ?? "").toLowerCase();
      if (storedMode === "monthly" || storedMode === "termly" || storedMode === "yearly") {
        setSelType(storedMode as PlanType);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoaded(true);
    }
  }, [base, yearId]);

  useEffect(() => { load(); }, [load]);

  // ── grid price for the chosen band/days/mode ──
  const gridPrice = useCallback(
    (band: string, days: number, mode: PlanType): number | null => {
      const cell = grid.find((g) => g.timingBand === band && g.daysPerWeek === days && g.mode === mode);
      return cell ? cell.amount : null;
    },
    [grid]
  );
  const price = gridPrice(selBand, selDays, selType);

  // ── ancillary "due now" items (non-tuition) ──
  const otherItems = templateItems.filter((i) => String(i.feeType ?? "").toLowerCase() !== "tuition");
  const dueNowSub = otherItems.reduce((s, i) => s + num(i.amount), 0);
  const dueNowVat = otherItems.reduce((s, i) => s + (i.vatApplicable ? (num(i.amount) * num(i.vatRate)) / 100 : 0), 0);
  const dueNowTotal = dueNowSub + dueNowVat;

  const hasAssignment = hasTemplate(assignment);
  const storedTuition = assignment?.tuitionAmount != null ? num(assignment.tuitionAmount) : 0;
  const storedMode = String(assignment?.registrationMode ?? "").toLowerCase();

  // ── plan resolution (mode + count → seeded billing plan) ──
  function resolvePlan(type: PlanType, count: number): Plan | undefined {
    const pt = (p: Plan) => String(p.planType).toLowerCase();
    if (type === "monthly") return plans.find((p) => pt(p) === "monthly" && p.installmentCount === 1);
    if (type === "termly") return plans.find((p) => pt(p) === "term_split" && p.installmentCount === count);
    if (count === 1) return plans.find((p) => pt(p) === "full_upfront");
    return plans.find((p) => pt(p) === "monthly" && p.installmentCount === count);
  }
  const effectiveCount = selType === "monthly" ? 1 : selCount;
  const targetPlan = resolvePlan(selType, effectiveCount);

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

  async function assign() {
    if (!templateId) { setMsg("No 2025/26 fee template found — create one in Admin first."); return; }
    if (!targetPlan) { setMsg("That plan isn’t seeded — run 04-billing-plans.sql."); return; }
    if (price == null) { setMsg("No tuition price for that timing/days/mode combination in the grid."); return; }
    if (price <= 0) { setMsg("Grid price is 0 for that combination — check Admin → Tuition pricing."); return; }
    setWorking(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        academicYearId: yearId,
        feeTemplateId: templateId,
        billingPlanId: targetPlan.id,
        registrationMode: selType,
        tuitionAmount: price,
      };
      await apiFetch(`${base}/fee-assignment`, { method: "PUT", body: JSON.stringify(body) });
      await apiFetch(`${base}/payment-schedule`, { method: "POST" });
      await load();
      setMsg("Saved — tuition schedule generated.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn’t save the fee assignment.");
    } finally {
      setWorking(false);
    }
  }

  // ── schedule view ──
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
    if (pendingDateChanges.length === 0) { setMsg("No date changes to save."); return; }
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

  const counts = selType === "termly" ? TERMLY_COUNTS : selType === "yearly" ? YEARLY_COUNTS : [];
  const dueNowDate = nextWorkingDayISO();
  const yearName = String(
    years.find((y) => String(y.id ?? "") === yearId)?.name ?? assignment?.academicYearName ?? ""
  );

  return (
    <div className="space-y-6">
      {!hasAssignment && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          No fee assigned yet. Pick the timing, days per week, and how tuition is paid, then assign.
        </div>
      )}

      {/* pricing form */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3 rounded-md border p-4">
          <div>
            <div className="mb-1 text-sm font-medium">Daily timing</div>
            <select
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              value={selBand}
              disabled={working}
              onChange={(e) => { setSelBand(e.target.value); setMsg(null); }}
            >
              {BANDS.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <div className="mb-1 text-sm font-medium">Days per week</div>
            <div className="flex gap-2">
              {[5, 3].map((d) => (
                <Button key={d} size="sm" variant={selDays === d ? "default" : "outline"} disabled={working}
                  onClick={() => { setSelDays(d); setMsg(null); }}>
                  {d} days
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-md border p-4">
          <div className="text-sm font-medium text-muted-foreground">Tuition ({selType})</div>
          <div className="mt-1 text-2xl font-bold">
            {price != null ? `AED ${money(price)}` : "—"}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {price != null ? (
              <>From the {yearName} pricing grid for <strong>{selBand}</strong>, <strong>{selDays} days</strong>,{" "}
              <strong>{selType}</strong>. Split across the payments below.</>
            ) : (
              <span className="text-amber-600">No grid price for this combination — check Admin → Tuition pricing.</span>
            )}
          </div>
          {hasAssignment && storedTuition > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              Currently assigned: AED {money(storedTuition)} ({storedMode || "—"}).
            </div>
          )}
        </div>
      </div>

      {/* due now (ancillary) */}
      {otherItems.length > 0 && (
        <div className="rounded-md border p-4">
          <div className="text-sm font-medium text-muted-foreground">Due now (one-time / ancillary)</div>
          <div className="mt-1 text-2xl font-bold">AED {money(dueNowTotal)}</div>
          <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {otherItems.map((i, idx) => (
              <div key={idx} className="flex justify-between">
                <span>{i.description ?? i.feeType}</span>
                <span>AED {money(num(i.amount))}{i.vatApplicable && num(i.vatRate) > 0 ? ` +${num(i.vatRate)}% VAT` : ""}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Billed immediately — due {dueNowDate}.</div>
        </div>
      )}

      {/* mode */}
      <div>
        <div className="mb-2 text-sm font-medium">
          Registration mode {current && <span className="font-normal text-muted-foreground">· current: {current.label}</span>}
          {yearName && <span className="ml-2 font-normal text-muted-foreground">· {yearName}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          {(["monthly", "termly", "yearly"] as PlanType[]).map((t) => (
            <Button key={t} size="sm" variant={selType === t ? "default" : "outline"} disabled={working}
              onClick={() => {
                setMsg(null); setSelType(t);
                if (t === "termly") setSelCount((c) => (TERMLY_COUNTS.includes(c) ? c : 3));
                if (t === "yearly") setSelCount((c) => (YEARLY_COUNTS.includes(c) ? c : 4));
              }}>
              {t === "monthly" ? "Monthly" : t === "termly" ? "Termly" : "Yearly"}
            </Button>
          ))}
        </div>
        {hasAssignment && !!storedMode && storedMode !== selType && (
          <p className="mt-2 text-xs text-amber-600">
            Switching mode from <strong>{storedMode}</strong> to <strong>{selType}</strong>. Already-invoiced payments
            stay; the new schedule covers what’s left.
          </p>
        )}
        {selType === "monthly" && (
          <p className="mt-2 text-xs text-muted-foreground">Monthly is month-to-month — one payment for the coming month.</p>
        )}
      </div>

      {/* count */}
      {counts.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-medium">How many payments?</div>
          <div className="flex flex-wrap gap-2">
            {counts.map((c) => (
              <Button key={c} size="sm" variant={selCount === c ? "default" : "outline"} disabled={working}
                onClick={() => { setMsg(null); setSelCount(c); }}>
                {c}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* assign */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={assign} disabled={working || !targetPlan || price == null}>
          {working ? "Saving…" : hasAssignment ? "Update fee & regenerate" : "Assign fee & generate schedule"}
        </Button>
        {!targetPlan && <span className="text-xs text-destructive">No matching plan seeded — run 04-billing-plans.sql.</span>}
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
          <p className="text-sm text-muted-foreground">No schedule yet — assign a fee above to generate it.</p>
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
                        {String(r.periodLabel ?? (String(r.kind) === "one_time" ? r.description ?? r.feeType ?? "One-time" : "Tuition"))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        {pending ? (
                          <input type="date" value={editedDate(r)} disabled={savingDates || working}
                            onChange={(e) => setDateEdits((prev) => ({ ...prev, [String(r.id)]: e.target.value }))}
                            className="rounded-md border px-2 py-1 text-sm" />
                        ) : (isoDate(r.dueDate) || "—")}
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
