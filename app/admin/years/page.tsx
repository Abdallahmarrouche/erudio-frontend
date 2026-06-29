// app/admin/years/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchList } from "@/lib/resource";
import { apiFetch } from "@/lib/api";

interface Year {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
  status?: string;
}

interface TermDraft {
  name: string;
  startDate: string;
  endDate: string;
}

const DEFAULT_TERMS: TermDraft[] = [
  { name: "Term 1", startDate: "", endDate: "" },
  { name: "Term 2", startDate: "", endDate: "" },
  { name: "Term 3", startDate: "", endDate: "" },
];

export default function YearsPage() {
  const [years, setYears] = useState<Year[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingId, setSettingId] = useState<string | null>(null);
  const [listMsg, setListMsg] = useState<string | null>(null);

  // create form
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [setCurrent, setSetCurrent] = useState(false);
  const [terms, setTerms] = useState<TermDraft[]>(DEFAULT_TERMS);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchList("/shared/academic-years");
      setYears(res.rows as unknown as Year[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load years");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function makeCurrent(y: Year) {
    if (y.isCurrent) return;
    if (
      !window.confirm(
        `Set ${y.name} as the current academic year? This changes system-wide defaults (e.g. which year new fee assignments and invoices use).`
      )
    )
      return;
    setSettingId(y.id);
    setListMsg(null);
    try {
      await apiFetch(`/shared/academic-years/${encodeURIComponent(y.id)}/current`, {
        method: "PUT",
        body: JSON.stringify({}),
      });
      await load();
      setListMsg(`${y.name} is now the current year.`);
    } catch (err) {
      setListMsg(err instanceof Error ? err.message : "Failed to set current");
    } finally {
      setSettingId(null);
    }
  }

  function updateTerm(i: number, field: keyof TermDraft, value: string) {
    setTerms((prev) =>
      prev.map((t, idx) => (idx === i ? { ...t, [field]: value } : t))
    );
  }
  function addTerm() {
    setTerms((prev) => [
      ...prev,
      { name: `Term ${prev.length + 1}`, startDate: "", endDate: "" },
    ]);
  }
  function removeTerm(i: number) {
    setTerms((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function createYear() {
    setCreateMsg(null);

    if (!name.trim() || !startDate || !endDate) {
      setCreateMsg("Name, start date and end date are required.");
      return;
    }
    // Only send terms that have both dates filled in.
    const filledTerms = terms
      .filter((t) => t.startDate && t.endDate)
      .map((t, i) => ({
        termNumber: i + 1,
        name: t.name.trim() || `Term ${i + 1}`,
        startDate: t.startDate,
        endDate: t.endDate,
      }));

    setCreating(true);
    try {
      await apiFetch("/shared/academic-years", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          startDate,
          endDate,
          setCurrent,
          terms: filledTerms,
        }),
      });
      // reset form
      setName("");
      setStartDate("");
      setEndDate("");
      setSetCurrent(false);
      setTerms(DEFAULT_TERMS);
      await load();
      setCreateMsg(
        `Created — ${filledTerms.length} term${
          filledTerms.length === 1 ? "" : "s"
        } added.`
      );
    } catch (err) {
      setCreateMsg(err instanceof Error ? err.message : "Failed to create year");
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppShell>
      <Link
        href="/admin"
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Back to admin
      </Link>

      <div className="mb-1 mt-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Academic Years</h1>
        <Link
          href="/admin/terms"
          className="text-sm text-muted-foreground hover:underline"
        >
          Edit term dates →
        </Link>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Create years ahead of time and choose which one is current. Term dates
        are editable later on the terms page.
      </p>

      {/* ---- existing years ---- */}
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <div className="mb-6 rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Couldn’t load years</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="mb-8 overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Year</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Dates</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Current</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <tr key={y.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-4 py-2 font-medium">{y.name}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                    {y.startDate} → {y.endDate}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">{y.status ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2">
                    {y.isCurrent ? (
                      <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                        current
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!y.isCurrent && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => makeCurrent(y)}
                        disabled={settingId === y.id}
                      >
                        {settingId === y.id ? "Setting…" : "Set as current"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {listMsg && <p className="-mt-6 mb-8 text-sm text-muted-foreground">{listMsg}</p>}

      {/* ---- create new year ---- */}
      <div className="rounded-md border p-5">
        <h2 className="text-lg font-semibold">Create a new year</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <Label htmlFor="yr-name">Name</Label>
            <Input
              id="yr-name"
              placeholder="2027/28"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="yr-start">Start date</Label>
            <Input
              id="yr-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="yr-end">End date</Label>
            <Input
              id="yr-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Terms</span>
            <Button size="sm" variant="outline" onClick={addTerm}>
              + Add term
            </Button>
          </div>
          <div className="space-y-2">
            {terms.map((t, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3">
                <Input
                  value={t.name}
                  onChange={(e) => updateTerm(i, "name", e.target.value)}
                  className="w-32"
                  placeholder={`Term ${i + 1}`}
                />
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Start</span>
                  <Input
                    type="date"
                    value={t.startDate}
                    onChange={(e) => updateTerm(i, "startDate", e.target.value)}
                    className="w-40"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">End</span>
                  <Input
                    type="date"
                    value={t.endDate}
                    onChange={(e) => updateTerm(i, "endDate", e.target.value)}
                    className="w-40"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeTerm(i)}
                  className="text-sm text-muted-foreground hover:text-destructive"
                >
                  remove
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Terms with both dates filled are created; blank rows are ignored. You
            can fine-tune dates later on the terms page.
          </p>
        </div>

        <label className="mt-5 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={setCurrent}
            onChange={(e) => setSetCurrent(e.target.checked)}
          />
          Make this the current year
        </label>

        <div className="mt-5 flex items-center gap-3">
          <Button onClick={createYear} disabled={creating}>
            {creating ? "Creating…" : "Create year"}
          </Button>
          {createMsg && (
            <span className="text-sm text-muted-foreground">{createMsg}</span>
          )}
        </div>
      </div>
    </AppShell>
  );
}
