// app/admin/tuition-pricing/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

const PRICING_ENDPOINT = "/shared/tuition-pricing";
const YEARS_ENDPOINT = "/shared/academic-years";
const inputCls = "w-28 rounded-md border bg-background px-2 py-1.5 text-right text-sm";

// Start is always 08:00; the band is the end time. Order matters (display + save).
const BANDS: { code: string; label: string }[] = [
  { code: "12:30", label: "8:00 AM – 12:30 PM" },
  { code: "14:00", label: "8:00 AM – 2:00 PM" },
  { code: "15:00", label: "8:00 AM – 3:00 PM" },
  { code: "16:00", label: "8:00 AM – 4:00 PM" },
  { code: "17:00", label: "8:00 AM – 5:00 PM" },
  { code: "18:00", label: "8:00 AM – 6:00 PM" },
];
// Column groups: mode + days-per-week.
const COLS: { mode: string; days: number; head: string; sub: string }[] = [
  { mode: "monthly", days: 5, head: "Monthly", sub: "5 days" },
  { mode: "monthly", days: 3, head: "Monthly", sub: "3 days" },
  { mode: "termly", days: 5, head: "Termly", sub: "5 days" },
  { mode: "termly", days: 3, head: "Termly", sub: "3 days" },
  { mode: "yearly", days: 5, head: "Yearly", sub: "5 days" },
  { mode: "yearly", days: 3, head: "Yearly", sub: "3 days" },
];

const keyOf = (band: string, mode: string, days: number) => `${band}|${mode}|${days}`;

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

interface YearOpt {
  id: string;
  name: string;
  isCurrent: boolean;
}
function asYear(r: Record<string, unknown>): YearOpt {
  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? r.id ?? ""),
    isCurrent: r.isCurrent === true || r.is_current === true || r.is_current === 1,
  };
}

export default function TuitionPricingAdminPage() {
  const [years, setYears] = useState<YearOpt[]>([]);
  const [yearId, setYearId] = useState<string>("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Load academic years once; default to the current year.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await apiFetch(YEARS_ENDPOINT).catch(() => null);
      if (cancelled) return;
      const ys = toRows(raw).map(asYear).filter((y) => y.id);
      ys.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0)); // newest first
      setYears(ys);
      const current = ys.find((y) => y.isCurrent) ?? ys[0];
      setYearId(current?.id ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadGrid = useCallback(async (yid: string) => {
    if (!yid) return;
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const raw = await apiFetch(`${PRICING_ENDPOINT}?academicYearId=${encodeURIComponent(yid)}`);
      const map: Record<string, string> = {};
      for (const r of toRows(raw)) {
        const band = String(r.timingBand ?? r.timing_band ?? "");
        const mode = String(r.mode ?? "");
        const days = Number(r.daysPerWeek ?? r.days_per_week ?? 0);
        const amt = r.amount;
        if (band && mode && days) map[keyOf(band, mode, days)] = amt != null ? String(amt) : "";
      }
      setAmounts(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t load the pricing grid.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (yearId) loadGrid(yearId);
  }, [yearId, loadGrid]);

  function setCell(key: string, v: string) {
    setAmounts((p) => ({ ...p, [key]: v }));
    setMsg(null);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    setError(null);
    try {
      const cells: { timingBand: string; daysPerWeek: number; mode: string; amount: number }[] = [];
      for (const b of BANDS) {
        for (const c of COLS) {
          const raw = amounts[keyOf(b.code, c.mode, c.days)] ?? "";
          const amount = Number(raw);
          if (raw.trim() === "" || !Number.isFinite(amount) || amount < 0) {
            throw new Error(`Enter a valid amount for ${b.label} · ${c.head} ${c.sub}.`);
          }
          cells.push({ timingBand: b.code, daysPerWeek: c.days, mode: c.mode, amount });
        }
      }
      await apiFetch(PRICING_ENDPOINT, {
        method: "PUT",
        body: JSON.stringify({ academicYearId: yearId, cells }),
      });
      await loadGrid(yearId);
      setMsg(`Saved all ${cells.length} prices.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t save the pricing grid.");
    } finally {
      setSaving(false);
    }
  }

  const selectedYear = years.find((y) => y.id === yearId);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Back to admin
        </Link>
        <h1 className="mt-3 text-2xl font-bold">Tuition pricing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One grid for all class levels. Prices are totals per mode (termly = whole-term total,
          yearly = full-year total). Zero-rated tuition. Update once per academic year.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium">Academic year</label>
          <select
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
            value={yearId}
            onChange={(e) => setYearId(e.target.value)}
            disabled={saving}
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.isCurrent ? " (current)" : ""}
              </option>
            ))}
          </select>
          {selectedYear && !loading && (
            <span className="text-xs text-muted-foreground">
              Editing {selectedYear.name}. Empty year? Fill the grid and save to seed it.
            </span>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading grid…</p>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Timing</th>
                  {COLS.map((c) => (
                    <th key={`${c.mode}-${c.days}`} className="px-3 py-2 text-right font-medium text-muted-foreground">
                      <div>{c.head}</div>
                      <div className="text-xs font-normal">{c.sub}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {BANDS.map((b) => (
                  <tr key={b.code} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 font-medium">{b.label}</td>
                    {COLS.map((c) => {
                      const key = keyOf(b.code, c.mode, c.days);
                      return (
                        <td key={key} className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            className={inputCls}
                            value={amounts[key] ?? ""}
                            disabled={saving}
                            onChange={(e) => setCell(key, e.target.value)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <Button onClick={save} disabled={saving || loading || !yearId}>
            {saving ? "Saving…" : "Save all prices"}
          </Button>
          {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
        </div>
      </div>
    </AppShell>
  );
}
