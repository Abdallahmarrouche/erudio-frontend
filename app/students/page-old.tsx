// app/students/page.tsx
"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DataTable } from "@/components/data-table";
import { fetchList } from "@/lib/resource";

// 👇 If your students route isn't /students, change this one line.
const STUDENTS_ENDPOINT = "/accounts/students";


export default function StudentsPage() {
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
        const result = await fetchList(STUDENTS_ENDPOINT);
        if (cancelled) return;
        setRows(result.rows);
        setMatched(result.matched);
        setRaw(result.raw);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load students");
        }
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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Students</h1>
        {!loading && !error && matched && (
          <span className="text-sm text-muted-foreground">
            {rows.length} record{rows.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Couldn’t load students</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <p className="mt-2 text-muted-foreground">
            If this is a 404, the route <code>{STUDENTS_ENDPOINT}</code> is likely
            wrong — update <code>STUDENTS_ENDPOINT</code> at the top of this file.
          </p>
        </div>
      )}

      {!loading && !error && matched && <DataTable rows={rows} />}

      {!loading && !error && !matched && (
        <div className="rounded-md border p-4 text-sm">
          <p className="text-muted-foreground">
            Got a response, but couldn’t spot a list inside it. Here’s the raw
            response so we can match the shape:
          </p>
          <pre className="mt-3 max-h-96 overflow-auto rounded bg-muted p-3 text-xs">
            {JSON.stringify(raw, null, 2)}
          </pre>
        </div>
      )}
    </AppShell>
  );
}
