// app/parents/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DataTable } from "@/components/data-table";
import { fetchList } from "@/lib/resource";

const PARENTS_ENDPOINT = "/accounts/parents";
const PARENT_ID_FIELD = "";

const ID_CANDIDATES = ["id", "parentId", "parent_id", "Id", "ID", "guardianId", "guardian_id"];

function getRowId(row: Record<string, unknown>): string | null {
  if (PARENT_ID_FIELD) {
    const v = row[PARENT_ID_FIELD];
    return v === undefined || v === null || v === "" ? null : String(v);
  }
  for (const field of ID_CANDIDATES) {
    const v = row[field];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return null;
}

export default function ParentsPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [raw, setRaw] = useState<unknown>(null);
  const [matched, setMatched] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchList(PARENTS_ENDPOINT);
        if (cancelled) return;
        setRows(result.rows);
        setMatched(result.matched);
        setRaw(result.raw);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load parents");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Parents</h1>
        <div className="flex items-center gap-3">
          {!loading && !error && matched && (
            <span className="text-sm text-muted-foreground">
              {rows.length} record{rows.length === 1 ? "" : "s"}
            </span>
          )}
          <Link
            href="/parents/new"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            New parent
          </Link>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Couldn’t load parents</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <p className="mt-2 text-muted-foreground">
            If this is a 404, the route <code>{PARENTS_ENDPOINT}</code> is likely wrong — update{" "}
            <code>PARENTS_ENDPOINT</code> at the top of this file.
          </p>
        </div>
      )}

      {!loading && !error && matched && (
        <>
          <DataTable
            rows={rows}
            getRowHref={(row) => {
              const id = getRowId(row);
              return id ? `/parents/${encodeURIComponent(id)}` : null;
            }}
          />
          <p className="mt-3 text-xs text-muted-foreground">Click a row to open the parent.</p>
        </>
      )}

      {!loading && !error && !matched && (
        <div className="rounded-md border p-4 text-sm">
          <p className="text-muted-foreground">
            Got a response, but couldn’t spot a list inside it. Here’s the raw response so we can
            match the shape:
          </p>
          <pre className="mt-3 max-h-96 overflow-auto rounded bg-muted p-3 text-xs">
            {JSON.stringify(raw, null, 2)}
          </pre>
        </div>
      )}
    </AppShell>
  );
}
