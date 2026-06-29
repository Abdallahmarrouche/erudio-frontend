// app/admin/periods/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { fetchList } from "@/lib/resource";
import { apiFetch } from "@/lib/api";

const PERIODS_ENDPOINT = "/shared/accounting-periods";

const STATUS_STYLES: Record<string, string> = {
  open: "bg-green-100 text-green-800",
  closed: "bg-muted text-muted-foreground",
  locked: "bg-amber-100 text-amber-800",
};

function StatusBadge({ status }: { status?: string }) {
  const s = String(status ?? "");
  const cls = STATUS_STYLES[s.toLowerCase()] ?? "bg-muted text-muted-foreground";
  return (
    <span className={"rounded-full px-2.5 py-0.5 text-xs font-medium " + cls}>
      {s || "—"}
    </span>
  );
}

export default function PeriodsPage() {
  const [periods, setPeriods] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const loadPeriods = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchList(PERIODS_ENDPOINT);
      setPeriods(result.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load periods");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPeriods();
  }, [loadPeriods]);

  function idOf(p: Record<string, unknown>): string {
    return String(p.id ?? "");
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === periods.length ? new Set() : new Set(periods.map(idOf))
    );
  }

  async function applyStatus(status: string) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setWorking(true);
    setActionMsg(null);

    const results = await Promise.allSettled(
      ids.map((id) =>
        apiFetch(`${PERIODS_ENDPOINT}/${encodeURIComponent(id)}/status`, {
          method: "PUT",
          body: JSON.stringify({ status }),
        })
      )
    );

    const okCount = results.filter((r) => r.status === "fulfilled").length;
    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );

    setSelected(new Set());
    await loadPeriods();

    let msg = `${okCount} period${okCount === 1 ? "" : "s"} set to ${status}.`;
    if (failures.length > 0) {
      const reason =
        failures[0].reason instanceof Error
          ? failures[0].reason.message
          : "unknown error";
      msg += ` ${failures.length} failed — ${reason}`;
    }
    setActionMsg(msg);
    setWorking(false);
  }

  const allSelected = periods.length > 0 && selected.size === periods.length;

  return (
    <AppShell>
      <Link
        href="/admin"
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Back to admin
      </Link>

      <div className="mb-2 mt-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Accounting Periods</h1>
        {!loading && !error && (
          <span className="text-sm text-muted-foreground">
            {periods.length} period{periods.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        Opening a closed period lets transactions post into it. Useful for
        testing; in production, treat reopening as a controlled action — it
        affects finalized figures.
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Couldn’t load periods</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <p className="mt-2 text-muted-foreground">
            A 403 on a status change means your account isn’t allowed to manage
            periods. A 404 means the backend endpoint isn’t deployed yet.
          </p>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => applyStatus("open")}
              disabled={working || selected.size === 0}
            >
              Open selected
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => applyStatus("closed")}
              disabled={working || selected.size === 0}
            >
              Close selected
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => applyStatus("locked")}
              disabled={working || selected.size === 0}
            >
              Lock selected
            </Button>
            <span className="text-sm text-muted-foreground">
              {selected.size} selected
            </span>
            {working && (
              <span className="text-sm text-muted-foreground">Working…</span>
            )}
          </div>

          {actionMsg && (
            <p className="mb-3 text-sm text-muted-foreground">{actionMsg}</p>
          )}

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Period
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Year
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Dates
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => {
                  const id = idOf(p);
                  return (
                    <tr
                      key={id}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(id)}
                          onChange={() => toggle(id)}
                          aria-label={`Select ${String(p.periodName ?? id)}`}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        {String(p.periodName ?? "—")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        {String(p.calendarYear ?? "—")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                        {String(p.startDate ?? "—")} → {String(p.endDate ?? "—")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <StatusBadge status={p.status as string} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AppShell>
  );
}
