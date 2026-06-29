// app/students/[id]/edit/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";
import { StudentForm, type StudentFormValues } from "@/components/student-form";

const STUDENTS_ENDPOINT = "/accounts/students";

function unwrap(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    for (const key of ["data", "student", "result", "item"]) {
      const inner = obj[key];
      if (inner && typeof inner === "object" && !Array.isArray(inner)) return inner as Record<string, unknown>;
    }
    return obj;
  }
  return null;
}
function s(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}

export default function EditStudentPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [initial, setInitial] = useState<Partial<StudentFormValues> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const st = unwrap(await apiFetch(`${STUDENTS_ENDPOINT}/${encodeURIComponent(id)}`));
        if (cancelled) return;
        if (!st) {
          setError("Student not found.");
        } else {
          setInitial({
            parentId: "",
            firstName: s(st.firstName),
            lastName: s(st.lastName),
            dob: s(st.dob).slice(0, 10),
            gender: s(st.gender) || "male",
            country: s(st.country),
            emiratesId: s(st.idType) === "passport" ? "" : s(st.idNumber),
            passportNumber: s(st.passportNumber),
            bloodType: s(st.bloodType),
          });
        }
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
      <div className="mx-auto max-w-3xl">
        <Link href={`/students/${encodeURIComponent(id)}`} className="text-sm text-muted-foreground hover:underline">
          ← Back to student
        </Link>
        <h1 className="mt-3 mb-6 text-2xl font-bold">Edit student</h1>
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
        )}
      </div>
      {!loading && !error && initial && <StudentForm mode="edit" studentId={id} initial={initial} />}
    </AppShell>
  );
}
