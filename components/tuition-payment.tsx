// components/tuition-payment.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

const STUDENTS_ENDPOINT = "/accounts/students";

// ---- helpers ---------------------------------------------------------------
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
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  isOptional?: boolean;
}

const CADENCES = [
  { key: "yearly", label: "Yearly", planType: "full_upfront" },
  { key: "termly", label: "Termly", planType: "term_split" },
  { key: "monthly", label: "Monthly", planType: "monthly" },
  { key: "weekly", label: "Weekly (camps)", planType: "weekly" },
] as const;

type Cadence = (typeof CADENCES)[number];

export function TuitionPayment({ studentId }: { studentId: string }) {
  const base = `${STUDENTS_ENDPOINT}/${encodeURIComponent(studentId)}`;

  const [assignment, setAssignment] = useState<Record<string, unknown> | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [schedule, setSchedule] = useState<Record<string, unknown>[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoaded(false);
    setError(null);
    try {
      const [aRaw, pRaw, sRaw] = await Promise.all([
        apiFetch(`${base}/fee-assignment`).catch(() => null),
        apiFetch(`/shared/billing-plans`).catch(() => null),
        apiFetch(`${base}/payment-schedule`).catch(() => null),
      ]);
      setAssignment(
        unwrap(aRaw, ["data", "feeAssignment", "assignment", "fee", "result", "item"])
      );
      setPlans(toRows(pRaw) as unknown as Plan[]);
      setSchedule(toRows(sRaw));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoaded(true);
    }
  }, [base]);

  useEffect(() => {
    load();
  }, [load]);

  // ---- derive ----
  const feeTemplate =
    (assignment?.feeTemplate ?? null) as Record<string, unknown> | null;
  const items: Item[] = Array.isArray(feeTemplate?.items)
    ? (feeTemplate!.items as Item[])
    : [];
  const tuitionItems = items.filter(
    (i) => String(i.feeType ?? "").toLowerCase() === "tuition"
  );
  const otherItems = items.filter(
    (i) => String(i.feeType ?? "").toLowerCase() !== "tuition"
  );
  const tuitionTotal = tuitionItems.reduce((s, i) => s + num(i.amount), 0);
  const dueNowSub = otherItems.reduce((s, i) => s + num(i.amount), 0);
  const dueNowVat = otherItems.reduce(
    (s, i) => s + (i.vatApplicable ? (num(i.amount) * num(i.vatRate)) / 100 : 0),
    0
  );
  const dueNowTotal = dueNowSub + dueNowVat;

  const billingPlanId = String(assignment?.billingPlanId ?? "");
  const planByType = (t: string) =>
    plans.find((p) => String(p.planType).toLowerCase() === t);
  const currentPlan = plans.find((p) => p.id === billingPlanId);
  const currentType = currentPlan ? String(currentPlan.planType).toLowerCase() : "";

  const hasAssignment = !!(assignment && feeTemplate?.id && assignment.academicYearId);

  async function applyCadence(c: Cadence) {
    const plan = planByType(c.planType);
    setConfirmKey(null);
    if (!plan) {
      setMsg(`No "${c.label}" billing plan exists yet — create one in Admin → Billing Plans.`);
      return;
    }
    if (!hasAssignment) {
      setMsg("This student has no fee assignment to schedule yet.");
      return;
    }
    setWorking(c.key);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        academicYearId: assignment!.academicYearId,
        feeTemplateId: feeTemplate!.id,
        billingPlanId: plan.id,
      };
      // preserve any existing discount so changing cadence never wipes it
      const disc = num(
        assignment!.oneTimeDiscountAmount ??
          assignment!.oneTimeDiscount ??
          assignment!.one_time_discount_amount
      );
      if (disc > 0) {
        body.oneTimeDiscountAmount = disc;
        const reason =
          assignment!.oneTimeDiscountReason ?? assignment!.one_time_discount_reason;
        if (reason) body.oneTimeDiscountReason = reason;
      }
      const fd = assignment!.feeDiscountId ?? assignment!.fee_discount_id;
      if (fd) body.feeDiscountId = fd;

      await apiFetch(`${base}/fee-assignment`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      await apiFetch(`${base}/payment-schedule`, { method: "POST" });
      await load();
      setMsg(`Tuition set to ${c.label} — schedule regenerated.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn’t update cadence");
    } finally {
      setWorking(null);
    }
  }

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">Loading tuition…</p>;
  }
  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
        <p className="font-medium text-destructive">Couldn’t load tuition setup</p>
        <p className="mt-1 text-muted-foreground">{error}</p>
      </div>
    );
  }
  if (!hasAssignment) {
    return (
      <div className="rounded-md border p-4 text-sm text-muted-foreground">
        No fee assignment on file for this student yet. Assign a fee template
        first, then choose how tuition is paid.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* the two-block math */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border p-4">
          <div className="text-sm font-medium text-muted-foreground">
            Tuition (scheduled)
          </div>
          <div className="mt-1 text-2xl font-bold">AED {money(tuitionTotal)}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Split across installments by the cadence below.
          </div>
        </div>
        <div className="rounded-md border p-4">
          <div className="text-sm font-medium text-muted-foreground">
            Due now (one-time)
          </div>
          <div className="mt-1 text-2xl font-bold">AED {money(dueNowTotal)}</div>
          <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {otherItems.map((i, idx) => (
              <div key={idx} className="flex justify-between">
                <span>{i.description ?? i.feeType}</span>
                <span>
                  AED {money(num(i.amount))}
                  {i.vatApplicable && num(i.vatRate) > 0
                    ? ` +${num(i.vatRate)}% VAT`
                    : ""}
                </span>
              </div>
            ))}
            {otherItems.length === 0 && <div>No additional items.</div>}
          </div>
        </div>
      </div>

      {/* cadence picker */}
      <div>
        <div className="mb-2 text-sm font-medium">How is tuition paid?</div>
        <div className="flex flex-wrap gap-2">
          {CADENCES.map((c) => {
            const active = currentType === c.planType;
            const available = !!planByType(c.planType);
            return (
              <Button
                key={c.key}
                size="sm"
                variant={active ? "default" : "outline"}
                disabled={working !== null}
                onClick={() => {
                  setMsg(null);
                  if (active) {
                    // re-apply (e.g. to regenerate) still asks first
                    setConfirmKey(c.key);
                  } else {
                    setConfirmKey(c.key);
                  }
                }}
              >
                {working === c.key ? "Working…" : c.label}
                {active ? " ✓" : ""}
                {!available ? " (none)" : ""}
              </Button>
            );
          })}
        </div>

        {confirmKey && (
          <div className="mt-3 rounded-md border bg-muted/30 p-3 text-sm">
            {(() => {
              const c = CADENCES.find((x) => x.key === confirmKey)!;
              return (
                <>
                  <p>
                    Set tuition to <span className="font-medium">{c.label}</span>{" "}
                    and regenerate the schedule? Any{" "}
                    <span className="font-medium">pending</span> installments are
                    replaced (invoiced ones are untouched).
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      disabled={working !== null}
                      onClick={() => applyCadence(c)}
                    >
                      {working ? "Working…" : "Confirm"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={working !== null}
                      onClick={() => setConfirmKey(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {msg && <p className="mt-2 text-sm text-muted-foreground">{msg}</p>}
      </div>

      {/* the resulting tuition schedule */}
      <div>
        <div className="mb-2 text-sm font-medium">
          Tuition schedule
          {currentPlan ? (
            <span className="ml-2 font-normal text-muted-foreground">
              ({currentPlan.name})
            </span>
          ) : null}
        </div>
        {schedule.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No schedule yet — pick a cadence above to generate it.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Due date</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Amount</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((r, idx) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="px-4 py-2">{String(r.installmentNumber ?? idx + 1)}</td>
                    <td className="whitespace-nowrap px-4 py-2">{String(r.dueDate ?? "—")}</td>
                    <td className="px-4 py-2 text-right">AED {money(num(r.amount))}</td>
                    <td className="px-4 py-2">{String(r.status ?? "—")}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-muted/30">
                <tr>
                  <td className="px-4 py-2 font-medium" colSpan={2}>Total</td>
                  <td className="px-4 py-2 text-right font-medium">
                    AED {money(schedule.reduce((s, r) => s + num(r.amount), 0))}
                  </td>
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
