// app/students/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";
import { prettifyKey, formatValue } from "@/components/data-table";

const STUDENTS_ENDPOINT = "/accounts/students";

// Single-student responses might be nested under data/student/etc. — unwrap.
function unwrap(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    for (const key of ["data", "student", "result", "item"]) {
      const inner = obj[key];
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        return inner as Record<string, unknown>;
      }
    }
    return obj;
  }
  return null;
}

// Best-effort display name for the heading.
function getName(s: Record<string, unknown>): string | null {
  for (const k of ["fullName", "name", "studentName", "displayName"]) {
    if (typeof s[k] === "string" && s[k]) return s[k] as string;
  }
  const first = s.firstName ?? s.first_name;
  const last = s.lastName ?? s.last_name;
  if (first || last) return [first, last].filter(Boolean).join(" ");
  return null;
}

export default function StudentDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [student, setStudent] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const raw = await apiFetch(
          `${STUDENTS_ENDPOINT}/${encodeURIComponent(id)}`
        );
        if (!cancelled) setStudent(unwrap(raw));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load student");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <AppShell>
      <Link
        href="/students"
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Back to students
      </Link>

      {loading && (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">
            Couldn’t load this student
          </p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <p className="mt-2 text-muted-foreground">
            If this is a 404, the id in the URL (<code>{id}</code>) isn’t what the{" "}
            <code>/accounts/students/{"{id}"}</code> endpoint expects. Tell me
            which field holds the right id and I’ll point the rows at it.
          </p>
        </div>
      )}

      {!loading && !error && student && (
        <>
          <h1 className="mt-3 text-2xl font-bold">
            {getName(student) ?? `Student ${id}`}
          </h1>
          <dl className="mt-6 divide-y rounded-md border">
            {Object.entries(student).map(([key, value]) => (
              <div
                key={key}
                className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-3"
              >
                <dt className="text-sm font-medium text-muted-foreground">
                  {prettifyKey(key)}
                </dt>
                <dd className="break-words text-sm sm:col-span-2">
                  {formatValue(value)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-sm text-muted-foreground">
            Fee assignment, payment schedule, and invoices for this student plug
            in here next.
          </p>
        </>
      )}
    </AppShell>
  );
}
