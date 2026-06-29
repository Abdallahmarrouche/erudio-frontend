// app/students/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { prettifyKey, FieldValue } from "@/components/data-table";
import { apiFetch } from "@/lib/api";
import { PaymentPlan } from "@/components/payment-plan";

const STUDENTS_ENDPOINT = "/accounts/students";

function unwrap(raw: unknown, keys: string[]): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    for (const key of keys) {
      const inner = obj[key];
      if (inner && typeof inner === "object" && !Array.isArray(inner)) return inner as Record<string, unknown>;
    }
    return obj;
  }
  return null;
}

function getName(s: Record<string, unknown>): string | null {
  for (const k of ["fullName", "name", "studentName", "displayName"]) {
    if (typeof s[k] === "string" && s[k]) return s[k] as string;
  }
  const first = s.firstName ?? s.first_name;
  const last = s.lastName ?? s.last_name;
  if (first || last) return [first, last].filter(Boolean).join(" ");
  return null;
}

function RecordList({ record }: { record: Record<string, unknown> }) {
  return (
    <dl className="divide-y rounded-md border">
      {Object.entries(record).map(([key, value]) => (
        <div key={key} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-3">
          <dt className="text-sm font-medium text-muted-foreground">{prettifyKey(key)}</dt>
          <dd className="break-words text-sm sm:col-span-2">
            <FieldValue fieldKey={key} value={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
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
        const raw = await apiFetch(`${STUDENTS_ENDPOINT}/${encodeURIComponent(id)}`);
        if (!cancelled) setStudent(unwrap(raw, ["data", "student", "result", "item"]));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load student");
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
      <Link href="/students" className="text-sm text-muted-foreground hover:underline">
        ← Back to students
      </Link>

      {loading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}

      {error && (
        <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Couldn’t load this student</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
        </div>
      )}

      {!loading && !error && student && (
        <>
          <div className="mt-3 flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold">{getName(student) ?? `Student ${id}`}</h1>
            <Link
              href={`/students/${encodeURIComponent(id)}/edit`}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Edit
            </Link>
          </div>

          <section className="mt-6">
            <h2 className="mb-3 text-lg font-semibold">Details</h2>
            <RecordList record={student} />
          </section>

          <section className="mt-8">
            <h2 className="mb-3 text-lg font-semibold">Payment plan</h2>
            <PaymentPlan studentId={id} />
          </section>

          <p className="mt-8 text-xs text-muted-foreground">
            Tuition is collected on the schedule above. When a payment reaches its due date it appears
            under <span className="font-medium">Payments</span>, where you run it to raise the invoice.
            Everything else (registration, meals, ECA) is billed immediately, not on this schedule.
          </p>
        </>
      )}
    </AppShell>
  );
}
