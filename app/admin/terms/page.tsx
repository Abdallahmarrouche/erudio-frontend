// app/admin/terms/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchList } from "@/lib/resource";
import { apiFetch } from "@/lib/api";

interface Term {
  id: string;
  academicYearId: string;
  termNumber: number | string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
}

interface Year {
  id: string;
  name: string;
  startDate?: string;
  isCurrent?: boolean;
}

export default function TermsPage() {
  const [years, setYears] = useState<Year[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [original, setOriginal] = useState<
    Record<string, { startDate: string; endDate: string }>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const [yearsRes, termsRes] = await Promise.all([
        fetchList("/shared/academic-years"),
        fetchList("/shared/academic-terms"),
      ]);
      setYears(yearsRes.rows as unknown as Year[]);
      const t = termsRes.rows as unknown as Term[];
      setTerms(t);
      const orig: Record<string, { startDate: string; endDate: string }> = {};
      for (const term of t) {
        orig[term.id] = {
          startDate: term.startDate ?? "",
          endDate: term.endDate ?? "",
        };
      }
      setOriginal(orig);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load terms");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function updateField(id: string, field: "startDate" | "endDate", value: string) {
    setTerms((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
  }

  function isChanged(t: Term): boolean {
    const o = original[t.id];
    if (!o) return false;
    return (t.startDate ?? "") !== o.startDate || (t.endDate ?? "") !== o.endDate;
  }

  const changedTerms = terms.filter(isChanged);

  async function saveChanges() {
    if (changedTerms.length === 0) return;
    setSaving(true);
    setMsg(null);

    const results = await Promise.allSettled(
      changedTerms.map((t) =>
        apiFetch(`/shared/academic-terms/${encodeURIComponent(t.id)}`, {
          method: "PUT",
          body: JSON.stringify({ startDate: t.startDate, endDate: t.endDate }),
        })
      )
    );

    const okCount = results.filter((r) => r.status === "fulfilled").length;
    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );

    await load();

    let m = `${okCount} term${okCount === 1 ? "" : "s"} saved.`;
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

  const yearName = (id: string) => years.find((y) => y.id === id)?.name ?? id;
  const yearStart = (id: string) =>
    years.find((y) => y.id === id)?.startDate ?? "";

  // group terms by academic year, then sort the GROUPS by the year's start date
  const groups: { yearId: string; terms: Term[] }[] = [];
  for (const t of terms) {
    let g = groups.find((x) => x.yearId === t.academicYearId);
    if (!g) {
      g = { yearId: t.academicYearId, terms: [] };
      groups.push(g);
    }
    g.terms.push(t);
  }
  groups.sort((a, b) => yearStart(b.yearId).localeCompare(yearStart(a.yearId)));
  for (const g of groups) {
    g.terms.sort((a, b) => Number(a.termNumber) - Number(b.termNumber));
  }

  return (
    <AppShell>
      <Link
        href="/admin"
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Back to admin
      </Link>

      <h1 className="mb-1 mt-3 text-2xl font-bold">Academic Terms</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Term start dates drive term-based tuition schedules. Edit the dates, then
        save.
      </p>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Couldn’t load terms</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <p className="mt-2 text-muted-foreground">
            A 403 when saving means your account isn’t allowed to edit terms. A
            404 means the backend endpoint isn’t deployed yet.
          </p>
        </div>
      )}

      {!loading && !error && groups.length === 0 && (
        <p className="text-sm text-muted-foreground">No academic terms found.</p>
      )}

      {!loading && !error && groups.length > 0 && (
        <>
          <div className="space-y-6">
            {groups.map((g) => (
              <div key={g.yearId} className="rounded-md border">
                <div className="border-b bg-muted/40 px-4 py-2 font-semibold">
                  {yearName(g.yearId)}
                </div>
                <div className="divide-y">
                  {g.terms.map((t) => (
                    <div
                      key={t.id}
                      className="flex flex-wrap items-center gap-4 px-4 py-3"
                    >
                      <div className="w-40">
                        <div className="font-medium">{t.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Term {String(t.termNumber)}
                          {t.isCurrent ? " · current" : ""}
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Start</span>
                        <Input
                          type="date"
                          value={t.startDate ?? ""}
                          onChange={(e) =>
                            updateField(t.id, "startDate", e.target.value)
                          }
                          className="w-44"
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">End</span>
                        <Input
                          type="date"
                          value={t.endDate ?? ""}
                          onChange={(e) =>
                            updateField(t.id, "endDate", e.target.value)
                          }
                          className="w-44"
                        />
                      </label>
                      {isChanged(t) && (
                        <span className="text-xs font-medium text-amber-600">
                          edited
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              onClick={saveChanges}
              disabled={saving || changedTerms.length === 0}
            >
              Save changes
            </Button>
            <span className="text-sm text-muted-foreground">
              {changedTerms.length} changed
            </span>
            {saving && (
              <span className="text-sm text-muted-foreground">Saving…</span>
            )}
            {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
          </div>
        </>
      )}
    </AppShell>
  );
}
