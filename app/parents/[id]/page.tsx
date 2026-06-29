// app/parents/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DataTable } from "@/components/data-table";
import { apiFetch } from "@/lib/api";
import { fetchList } from "@/lib/resource";
import { prettifyKey, formatValue } from "@/components/data-table";

const PARENTS_ENDPOINT = "/accounts/parents";

function unwrap(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    for (const key of ["data", "parent", "result", "item"]) {
      const inner = obj[key];
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        return inner as Record<string, unknown>;
      }
    }
    return obj;
  }
  return null;
}

function getName(p: Record<string, unknown>): string | null {
  for (const k of ["fullName", "name", "parentName", "displayName"]) {
    if (typeof p[k] === "string" && p[k]) return p[k] as string;
  }
  const first = p.firstName ?? p.first_name;
  const last = p.lastName ?? p.last_name;
  if (first || last) return [first, last].filter(Boolean).join(" ");
  return null;
}

function getStudentId(row: Record<string, unknown>): string | null {
  for (const f of ["id", "studentId", "student_id", "illumineId", "illumine_id"]) {
    const v = row[f];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return null;
}

export default function ParentDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");

  const [parent, setParent] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const raw = await apiFetch(`${PARENTS_ENDPOINT}/${encodeURIComponent(id)}`);
        if (!cancelled) setParent(unwrap(raw));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load parent");
      } finally {
        if (!cancelled) setLoading(false);
      }

      try {
        const result = await fetchList(`${PARENTS_ENDPOINT}/${encodeURIComponent(id)}/students`);
        if (!cancelled && result.matched) setStudents(result.rows);
      } catch {
        /* leave the section empty if it isn't available */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <AppShell>
      <Link href="/parents" className="text-sm text-muted-foreground hover:underline">
        ← Back to parents
      </Link>

      {loading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}

      {error && (
        <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Couldn’t load this parent</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <p className="mt-2 text-muted-foreground">
            If this is a 404, the id in the URL (<code>{id}</code>) isn’t what the{" "}
            <code>/accounts/parents/{"{id}"}</code> endpoint expects.
          </p>
        </div>
      )}

      {!loading && !error && parent && (
        <>
          <div className="mt-3 flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold">{getName(parent) ?? `Parent ${id}`}</h1>
            <div className="flex items-center gap-2">
              <Link
                href={`/students/new?parentId=${encodeURIComponent(id)}`}
                className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted/40"
              >
                Add student
              </Link>
              <Link
                href={`/parents/${encodeURIComponent(id)}/edit`}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Edit
              </Link>
            </div>
          </div>

          <dl className="mt-6 divide-y rounded-md border">
            {Object.entries(parent).map(([key, value]) => (
              <div key={key} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-3">
                <dt className="text-sm font-medium text-muted-foreground">{prettifyKey(key)}</dt>
                <dd className="break-words text-sm sm:col-span-2">{formatValue(value)}</dd>
              </div>
            ))}
          </dl>

          {students.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-3 text-lg font-semibold">Students ({students.length})</h2>
              <DataTable
                rows={students}
                getRowHref={(row) => {
                  const sid = getStudentId(row);
                  return sid ? `/students/${encodeURIComponent(sid)}` : null;
                }}
              />
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
