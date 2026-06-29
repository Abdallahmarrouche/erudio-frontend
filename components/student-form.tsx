// components/student-form.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { COUNTRIES } from "@/lib/countries";

const STUDENTS_ENDPOINT = "/accounts/students";
const PARENTS_ENDPOINT = "/accounts/parents";
const inputCls = "w-full rounded-md border px-2 py-1.5 text-sm";
const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export interface StudentFormValues {
  parentId: string;
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  country: string;
  emiratesId: string;
  passportNumber: string;
  bloodType: string;
}

const EMPTY: StudentFormValues = {
  parentId: "", firstName: "", lastName: "", dob: "", gender: "male",
  country: "", emiratesId: "", passportNumber: "", bloodType: "",
};

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
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function StudentForm({
  mode,
  studentId,
  initial,
}: {
  mode: "create" | "edit";
  studentId?: string;
  initial?: Partial<StudentFormValues>;
}) {
  const router = useRouter();
  const [f, setF] = useState<StudentFormValues>({ ...EMPTY, ...(initial ?? {}) });
  const [parents, setParents] = useState<Record<string, unknown>[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "create") return;
    let cancelled = false;
    (async () => {
      const all: Record<string, unknown>[] = [];
      for (let page = 1; page <= 50; page++) {
        const raw = await apiFetch(`${PARENTS_ENDPOINT}?page=${page}&pageSize=100`).catch(() => null);
        const batch = toRows(raw);
        all.push(...batch);
        if (batch.length < 100) break;
      }
      if (cancelled) return;
      const seen = new Set<string>();
      setParents(all.filter((p) => {
        const id = String(p.id ?? "");
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  function set<K extends keyof StudentFormValues>(k: K, v: string) {
    setF((p) => ({ ...p, [k]: v }));
    setError(null);
  }

  async function submit() {
    setError(null);
    if (mode === "create" && !f.parentId) return setError("Choose a parent.");
    if (!f.firstName.trim()) return setError("First name is required.");
    if (!f.lastName.trim()) return setError("Last name is required.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.dob)) return setError("Date of birth is required.");
    if (!f.country.trim()) return setError("Country is required.");

    const opt = (v: string) => (v.trim() ? v.trim() : mode === "edit" ? null : undefined);
    const idFields = f.emiratesId.trim()
      ? { idType: "emirates_id", idNumber: f.emiratesId.trim() }
      : mode === "edit" ? { idType: null, idNumber: null } : {};

    const body: Record<string, unknown> = {
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      dob: f.dob,
      gender: f.gender,
      nationality: f.country.trim(), // country drives the nationality field
      country: f.country.trim(),
      passportNumber: opt(f.passportNumber),
      bloodType: f.bloodType ? f.bloodType : mode === "edit" ? null : undefined,
      ...idFields,
    };
    if (mode === "create") body.parentId = f.parentId;
    Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);

    setSaving(true);
    try {
      const path = mode === "create" ? STUDENTS_ENDPOINT : `${STUDENTS_ENDPOINT}/${encodeURIComponent(studentId!)}`;
      const res = (await apiFetch(path, {
        method: mode === "create" ? "POST" : "PUT",
        body: JSON.stringify(body),
      })) as Record<string, unknown>;
      const data = (res?.data as Record<string, unknown>) ?? res;
      const id = data?.id ? String(data.id) : studentId ?? "";
      router.push(id ? `/students/${encodeURIComponent(id)}` : "/students");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t save the student.");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      {error && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <section className="rounded-md border p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {mode === "create" && (
            <div className="sm:col-span-2">
              <Field label="Parent" required>
                <select className={inputCls} value={f.parentId} disabled={saving} onChange={(e) => set("parentId", e.target.value)}>
                  <option value="">Select a parent…</option>
                  {parents.map((p) => {
                    const id = String(p.id ?? "");
                    const name = String(p.fullName ?? p.full_name ?? p.parentCode ?? id);
                    return <option key={id} value={id}>{name}</option>;
                  })}
                </select>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Parent not listed? <Link href="/parents/new" className="underline">Create one first</Link>.
                </span>
              </Field>
            </div>
          )}
          <Field label="First name" required>
            <input className={inputCls} value={f.firstName} disabled={saving} onChange={(e) => set("firstName", e.target.value)} />
          </Field>
          <Field label="Last name" required>
            <input className={inputCls} value={f.lastName} disabled={saving} onChange={(e) => set("lastName", e.target.value)} />
          </Field>
          <Field label="Date of birth" required>
            <input type="date" className={inputCls} value={f.dob} max={new Date().toISOString().slice(0, 10)} disabled={saving} onChange={(e) => set("dob", e.target.value)} />
          </Field>
          <Field label="Gender" required>
            <select className={inputCls} value={f.gender} disabled={saving} onChange={(e) => set("gender", e.target.value)}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </Field>
          <Field label="Blood type">
            <select className={inputCls} value={f.bloodType} disabled={saving} onChange={(e) => set("bloodType", e.target.value)}>
              <option value="">— unknown —</option>
              {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Country" required>
            <select className={inputCls} value={f.country} disabled={saving} onChange={(e) => set("country", e.target.value)}>
              <option value="">Select a country…</option>
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
            <Field label="Emirates ID number">
              <input className={inputCls} value={f.emiratesId} disabled={saving} placeholder="784-…" onChange={(e) => set("emiratesId", e.target.value)} />
            </Field>
            <Field label="Passport number">
              <input className={inputCls} value={f.passportNumber} disabled={saving} onChange={(e) => set("passportNumber", e.target.value)} />
            </Field>
          </div>
        </div>
      </section>

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={submit} disabled={saving}>
          {saving ? "Saving…" : mode === "create" ? "Create student" : "Save changes"}
        </Button>
        <Link href={mode === "edit" && studentId ? `/students/${encodeURIComponent(studentId)}` : "/students"} className="text-sm text-muted-foreground hover:underline">
          Cancel
        </Link>
      </div>
      {mode === "create" && (
        <p className="mt-4 text-xs text-muted-foreground">
          After creating, open the student to assign a fee template and choose how tuition is paid.
        </p>
      )}
    </div>
  );
}
