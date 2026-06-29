// app/admin/opening-balances/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

const PARENTS_ENDPOINT = "/accounts/parents";
const STATUS_ENDPOINT = "/admin/migration/status";
const VALIDATE_ENDPOINT = "/admin/migration/parent-opening-balances/validate";
const IMPORT_ENDPOINT = "/admin/migration/parent-opening-balances";
const inputCls = "w-full rounded-md border bg-background px-2 py-1.5 text-sm";

function today() {
  return new Date().toISOString().slice(0, 10);
}
const money = (n: number) =>
  new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED" }).format(n || 0);

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

interface Parent {
  id: string;
  parentCode: string;
  fullName: string;
}
interface Issue {
  row: number;
  parentCode: string;
  issue: string;
}
interface OBRow {
  parentCode: string;
  amount: number;
  asOfDate: string;
  sourceReference?: string;
  notes?: string;
}

export default function OpeningBalancesPage() {
  const [mode, setMode] = useState<"grid" | "paste">("grid");
  const [asOfDate, setAsOfDate] = useState(today());

  const [parents, setParents] = useState<Parent[]>([]);
  const [loadingParents, setLoadingParents] = useState(true);
  const [filter, setFilter] = useState("");

  // grid amounts keyed by parentCode
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [refs, setRefs] = useState<Record<string, string>>({});

  // paste
  const [pasteText, setPasteText] = useState("");

  // status
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);

  // results
  const [validation, setValidation] = useState<{
    valid: boolean;
    totalRows: number;
    validRows: number;
    issues: Issue[];
    totalDebit: number;
    totalCredit: number;
  } | null>(null);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    skippedReasons: Issue[];
    message: string;
  } | null>(null);

  const [busy, setBusy] = useState<"validate" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await apiFetch(STATUS_ENDPOINT);
      setStatus((res && typeof res === "object" ? (res as Record<string, unknown>) : null));
    } catch {
      /* status is informational only */
    }
  }, []);

  const loadParents = useCallback(async () => {
    setLoadingParents(true);
    try {
      const all: Parent[] = [];
      for (let page = 1; page <= 50; page++) {
        const res = await apiFetch(`${PARENTS_ENDPOINT}?page=${page}&pageSize=100`);
        const batch = toRows(res).map((r) => ({
          id: String(r.id ?? ""),
          parentCode: String(r.parentCode ?? ""),
          fullName: String(r.fullName ?? ""),
        }));
        all.push(...batch);
        if (batch.length < 100) break;
      }
      all.sort((a, b) => a.fullName.localeCompare(b.fullName));
      setParents(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load parents");
    } finally {
      setLoadingParents(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadParents();
  }, [loadStatus, loadParents]);

  // ── Build rows from the active mode ────────────────────────────────────────
  const builtRows = useMemo<OBRow[]>(() => {
    if (mode === "grid") {
      const out: OBRow[] = [];
      for (const p of parents) {
        const raw = (amounts[p.parentCode] ?? "").trim();
        if (raw === "") continue;
        const amount = Number(raw);
        if (!Number.isFinite(amount) || amount === 0) continue;
        const ref = (refs[p.parentCode] ?? "").trim();
        out.push({
          parentCode: p.parentCode,
          amount,
          asOfDate,
          ...(ref ? { sourceReference: ref } : {}),
        });
      }
      return out;
    }
    // paste mode: parentCode , amount [, asOfDate] [, reference] [, notes]
    const out: OBRow[] = [];
    for (const line of pasteText.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      const parts = t.split(/\t|,/).map((s) => s.trim());
      const [code, amtStr, dateStr, ref, notes] = parts;
      const amount = Number(amtStr);
      if (!code || !Number.isFinite(amount) || amount === 0) continue;
      out.push({
        parentCode: code,
        amount,
        asOfDate: dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : asOfDate,
        ...(ref ? { sourceReference: ref } : {}),
        ...(notes ? { notes } : {}),
      });
    }
    return out;
  }, [mode, parents, amounts, refs, asOfDate, pasteText]);

  const preview = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const r of builtRows) {
      if (r.amount > 0) debit += r.amount;
      else credit += Math.abs(r.amount);
    }
    return { count: builtRows.length, debit, credit };
  }, [builtRows]);

  async function validate() {
    setError(null);
    setImportResult(null);
    setValidation(null);
    if (builtRows.length === 0) {
      setError("Enter at least one non-zero amount.");
      return;
    }
    setBusy("validate");
    try {
      const res = (await apiFetch(VALIDATE_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ rows: builtRows }),
      })) as typeof validation;
      setValidation(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed.");
    } finally {
      setBusy(null);
    }
  }

  async function runImport() {
    setError(null);
    if (builtRows.length === 0) return;
    setBusy("import");
    try {
      const res = (await apiFetch(IMPORT_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ rows: builtRows }),
      })) as typeof importResult;
      setImportResult(res);
      setValidation(null);
      // Clear the amounts that were imported successfully (skipped stay so they can be fixed).
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(null);
    }
  }

  const visibleParents = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return parents;
    return parents.filter(
      (p) => p.fullName.toLowerCase().includes(q) || p.parentCode.toLowerCase().includes(q)
    );
  }, [parents, filter]);

  const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Opening balances</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter what each family already owed (or was in credit) at go-live. Posts to the parent AR
            ledger only — no journal entry, and each parent can only be imported once.
          </p>
        </div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Admin
        </Link>
      </div>

      {/* Status */}
      {status && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Parents" value={String(num(status.totalParents))} />
          <Stat label="Imported" value={String(num(status.importedCount))} />
          <Stat label="Not yet imported" value={String(num(status.notYetImportedCount))} />
          <Stat label="Net AR imported" value={money(num(status.totalDebit) - num(status.totalCredit))} />
        </div>
      )}

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-end gap-4 rounded-md border p-4">
        <div className="inline-flex rounded-md border p-0.5">
          <button
            className={`rounded px-3 py-1 text-sm ${mode === "grid" ? "bg-muted font-medium" : "text-muted-foreground"}`}
            onClick={() => setMode("grid")}
          >
            Enter per family
          </button>
          <button
            className={`rounded px-3 py-1 text-sm ${mode === "paste" ? "bg-muted font-medium" : "text-muted-foreground"}`}
            onClick={() => setMode("paste")}
          >
            Paste from Illumine
          </button>
        </div>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">As-of date</span>
          <input
            type="date"
            className={inputCls}
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
          />
        </label>
        <p className="max-w-md text-xs text-muted-foreground">
          Positive = family owes you (outstanding fees). Negative = family is in credit. The as-of date
          applies to every row unless a paste line overrides it.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-muted-foreground">
          {error}
        </div>
      )}

      {/* Entry */}
      {mode === "grid" ? (
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <input
              className={`${inputCls} max-w-xs`}
              placeholder="Filter by name or code…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              {loadingParents ? "Loading families…" : `${parents.length} families`}
            </span>
          </div>
          <div className="max-h-[28rem] overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b bg-muted/80 backdrop-blur">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Family</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Code</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Opening amount</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Reference (optional)</th>
                </tr>
              </thead>
              <tbody>
                {visibleParents.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-1.5">{p.fullName}</td>
                    <td className="px-4 py-1.5 text-muted-foreground">{p.parentCode}</td>
                    <td className="px-4 py-1.5">
                      <input
                        className={`${inputCls} w-32`}
                        inputMode="decimal"
                        placeholder="0.00"
                        value={amounts[p.parentCode] ?? ""}
                        onChange={(e) =>
                          setAmounts((m) => ({ ...m, [p.parentCode]: e.target.value }))
                        }
                      />
                    </td>
                    <td className="px-4 py-1.5">
                      <input
                        className={`${inputCls} w-44`}
                        placeholder="e.g. Illumine #1234"
                        value={refs[p.parentCode] ?? ""}
                        onChange={(e) => setRefs((m) => ({ ...m, [p.parentCode]: e.target.value }))}
                      />
                    </td>
                  </tr>
                ))}
                {!loadingParents && visibleParents.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                      No families match “{filter}”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="mb-4">
          <p className="mb-2 text-xs text-muted-foreground">
            One row per line: <code>parentCode, amount, asOfDate?, reference?, notes?</code> — comma or
            tab separated. Amount and parentCode are required; asOfDate defaults to the date above.
          </p>
          <textarea
            className={`${inputCls} h-56 font-mono text-xs`}
            placeholder={"P-00123, 4500, 2026-07-01, Illumine carryover\nP-00124, 1200\nP-00125, -300, , , Overpaid in June"}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
        </div>
      )}

      {/* Preview + actions */}
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-md border bg-muted/30 p-4">
        <div className="text-sm">
          <span className="font-medium">{preview.count}</span> row{preview.count === 1 ? "" : "s"} ready ·{" "}
          owed <span className="font-medium">{money(preview.debit)}</span>
          {preview.credit > 0 && (
            <>
              {" "}· credit <span className="font-medium">{money(preview.credit)}</span>
            </>
          )}
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={validate} disabled={busy !== null || preview.count === 0}>
            {busy === "validate" ? "Checking…" : "Validate"}
          </Button>
          <Button
            size="sm"
            onClick={runImport}
            disabled={busy !== null || preview.count === 0 || (validation !== null && !validation.valid)}
          >
            {busy === "import" ? "Importing…" : "Import"}
          </Button>
        </div>
      </div>

      {/* Validation result */}
      {validation && (
        <div className="mb-6 rounded-md border p-4">
          <div className="mb-2 flex items-center gap-2 text-sm">
            {validation.valid ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                All {validation.validRows} rows valid
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                {validation.issues.length} issue{validation.issues.length === 1 ? "" : "s"} —{" "}
                {validation.validRows} of {validation.totalRows} rows OK
              </span>
            )}
            <span className="text-muted-foreground">
              owed {money(validation.totalDebit)}
              {validation.totalCredit > 0 && <> · credit {money(validation.totalCredit)}</>}
            </span>
          </div>
          {validation.issues.length > 0 && <IssueTable issues={validation.issues} />}
          {!validation.valid && (
            <p className="mt-2 text-xs text-muted-foreground">
              Importing will post the {validation.validRows} valid row(s) and skip the rest.
            </p>
          )}
        </div>
      )}

      {/* Import result */}
      {importResult && (
        <div className="mb-6 rounded-md border border-emerald-200 bg-emerald-50/50 p-4">
          <p className="text-sm font-medium">{importResult.message}</p>
          {importResult.skipped > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Skipped rows:</p>
              <IssueTable issues={importResult.skippedReasons} />
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold">{value}</div>
    </div>
  );
}

function IssueTable({ issues }: { issues: Issue[] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Row</th>
            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Parent code</th>
            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Issue</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((it, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="px-3 py-1.5 text-muted-foreground">{it.row}</td>
              <td className="px-3 py-1.5">{it.parentCode || "—"}</td>
              <td className="px-3 py-1.5">{it.issue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
