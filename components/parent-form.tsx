// components/parent-form.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { COUNTRIES } from "@/lib/countries";

const PARENTS_ENDPOINT = "/accounts/parents";
const inputCls = "w-full rounded-md border px-2 py-1.5 text-sm";

export interface ParentFormValues {
  parentType: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phone2: string;
  phone3: string;
  country: string;
  emiratesId: string;
  passportNumber: string;
  notes: string;
  spouseFirstName: string;
  spouseLastName: string;
  spousePhone: string;
  spouseEmail: string;
  spouseEmiratesId: string;
  spousePassportNumber: string;
}

const EMPTY: ParentFormValues = {
  parentType: "father", firstName: "", lastName: "", email: "", phone: "", phone2: "", phone3: "",
  country: "", emiratesId: "", passportNumber: "", notes: "",
  spouseFirstName: "", spouseLastName: "", spousePhone: "", spouseEmail: "",
  spouseEmiratesId: "", spousePassportNumber: "",
};

// Pull the etag out of a single-record GET response (body field, not a header).
function readEtag(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const rec = (obj.data && typeof obj.data === "object" ? obj.data : obj) as Record<string, unknown>;
  const tag = rec.etag ?? obj.etag;
  return tag != null ? String(tag) : null;
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

function CountrySelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <select className={inputCls} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select a country…</option>
      {COUNTRIES.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  );
}

export function ParentForm({
  mode,
  parentId,
  initial,
}: {
  mode: "create" | "edit";
  parentId?: string;
  initial?: Partial<ParentFormValues>;
}) {
  const router = useRouter();
  const [f, setF] = useState<ParentFormValues>({ ...EMPTY, ...(initial ?? {}) });
  const [etag, setEtag] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit mode: capture the current record's etag (sent back as If-Match on save).
  useEffect(() => {
    if (mode !== "edit" || !parentId) return;
    let cancelled = false;
    (async () => {
      const raw = await apiFetch(`${PARENTS_ENDPOINT}/${encodeURIComponent(parentId)}`).catch(() => null);
      if (cancelled) return;
      setEtag(readEtag(raw));
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, parentId]);

  function set<K extends keyof ParentFormValues>(k: K, v: string) {
    setF((p) => ({ ...p, [k]: v }));
    setError(null);
  }

  const otherLabel = f.parentType === "father" ? "Mother" : "Father";

  async function submit() {
    setError(null);
    if (!f.firstName.trim()) return setError("First name is required.");
    if (!f.lastName.trim()) return setError("Last name is required.");
    if (!f.email.trim()) return setError("Email is required.");
    if (!f.phone.trim()) return setError("Primary phone is required (e.g. +971501234567).");
    if (!f.country.trim()) return setError("Country is required.");

    const opt = (v: string) => (v.trim() ? v.trim() : mode === "edit" ? null : undefined);
    // Emirates ID number -> id_type/id_number (no type picker). Passport is its own field.
    const idFields = f.emiratesId.trim()
      ? { idType: "emirates_id", idNumber: f.emiratesId.trim() }
      : mode === "edit" ? { idType: null, idNumber: null } : {};
    const spouseIdFields = f.spouseEmiratesId.trim()
      ? { spouseIdType: "emirates_id", spouseIdNumber: f.spouseEmiratesId.trim() }
      : mode === "edit" ? { spouseIdType: null, spouseIdNumber: null } : {};

    const body: Record<string, unknown> = {
      parentType: f.parentType,
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      email: f.email.trim(),
      phone: f.phone.trim(),
      phone2: opt(f.phone2),
      phone3: opt(f.phone3),
      nationality: f.country.trim(), // country drives the nationality field
      country: f.country.trim(),
      passportNumber: opt(f.passportNumber),
      notes: opt(f.notes),
      spouseFirstName: opt(f.spouseFirstName),
      spouseLastName: opt(f.spouseLastName),
      spousePhone: opt(f.spousePhone),
      spouseEmail: opt(f.spouseEmail),
      spousePassportNumber: opt(f.spousePassportNumber),
      ...idFields,
      ...spouseIdFields,
    };
    Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);

    setSaving(true);
    try {
      const path = mode === "create" ? PARENTS_ENDPOINT : `${PARENTS_ENDPOINT}/${encodeURIComponent(parentId!)}`;

      // Edit mode requires If-Match. Use the etag captured on load; if it didn't
      // arrive yet, fetch the record once more to get a fresh one.
      let ifMatch = etag;
      if (mode === "edit" && !ifMatch) {
        ifMatch = readEtag(await apiFetch(path).catch(() => null));
      }
      if (mode === "edit" && !ifMatch) {
        throw new Error("Couldn’t read this parent’s current version. Refresh the page and try again.");
      }

      const res = (await apiFetch(path, {
        method: mode === "create" ? "POST" : "PUT",
        body: JSON.stringify(body),
        ...(mode === "edit" && ifMatch ? { headers: { "If-Match": ifMatch } } : {}),
      })) as Record<string, unknown>;
      const data = (res?.data as Record<string, unknown>) ?? res;
      const id = data?.id ? String(data.id) : parentId ?? "";
      router.push(id ? `/parents/${encodeURIComponent(id)}` : "/parents");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t save the parent.");
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
        <h2 className="font-semibold">Main parent</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="This parent is the" required>
            <select className={inputCls} value={f.parentType} disabled={saving} onChange={(e) => set("parentType", e.target.value)}>
              <option value="father">Father</option>
              <option value="mother">Mother</option>
            </select>
          </Field>
          <Field label="Country" required>
            <CountrySelect value={f.country} disabled={saving} onChange={(v) => set("country", v)} />
          </Field>
          <Field label="First name" required>
            <input className={inputCls} value={f.firstName} disabled={saving} onChange={(e) => set("firstName", e.target.value)} />
          </Field>
          <Field label="Last name" required>
            <input className={inputCls} value={f.lastName} disabled={saving} onChange={(e) => set("lastName", e.target.value)} />
          </Field>
          <Field label="Email" required>
            <input type="email" className={inputCls} value={f.email} disabled={saving} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Primary phone" required>
            <input className={inputCls} value={f.phone} disabled={saving} placeholder="+971501234567" onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Phone 2">
            <input className={inputCls} value={f.phone2} disabled={saving} placeholder="+9715…" onChange={(e) => set("phone2", e.target.value)} />
          </Field>
          <Field label="Phone 3">
            <input className={inputCls} value={f.phone3} disabled={saving} placeholder="+9715…" onChange={(e) => set("phone3", e.target.value)} />
          </Field>
          <Field label="Emirates ID number">
            <input className={inputCls} value={f.emiratesId} disabled={saving} placeholder="784-…" onChange={(e) => set("emiratesId", e.target.value)} />
          </Field>
          <Field label="Passport number">
            <input className={inputCls} value={f.passportNumber} disabled={saving} onChange={(e) => set("passportNumber", e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="mt-6 rounded-md border p-4">
        <h2 className="font-semibold">Other parent ({otherLabel})</h2>
        <p className="mt-1 text-xs text-muted-foreground">Optional — the {otherLabel.toLowerCase()}’s details.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="First name">
            <input className={inputCls} value={f.spouseFirstName} disabled={saving} onChange={(e) => set("spouseFirstName", e.target.value)} />
          </Field>
          <Field label="Last name">
            <input className={inputCls} value={f.spouseLastName} disabled={saving} onChange={(e) => set("spouseLastName", e.target.value)} />
          </Field>
          <Field label="Phone">
            <input className={inputCls} value={f.spousePhone} disabled={saving} placeholder="+9715…" onChange={(e) => set("spousePhone", e.target.value)} />
          </Field>
          <Field label="Email">
            <input type="email" className={inputCls} value={f.spouseEmail} disabled={saving} onChange={(e) => set("spouseEmail", e.target.value)} />
          </Field>
          <Field label="Emirates ID number">
            <input className={inputCls} value={f.spouseEmiratesId} disabled={saving} placeholder="784-…" onChange={(e) => set("spouseEmiratesId", e.target.value)} />
          </Field>
          <Field label="Passport number">
            <input className={inputCls} value={f.spousePassportNumber} disabled={saving} onChange={(e) => set("spousePassportNumber", e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="mt-6 rounded-md border p-4">
        <h2 className="font-semibold">Notes</h2>
        <textarea
          className="mt-3 w-full rounded-md border px-2 py-1.5 text-sm"
          rows={4}
          value={f.notes}
          disabled={saving}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Anything worth recording about this family…"
        />
      </section>

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={submit} disabled={saving}>
          {saving ? "Saving…" : mode === "create" ? "Create parent" : "Save changes"}
        </Button>
        <Link href={mode === "edit" && parentId ? `/parents/${encodeURIComponent(parentId)}` : "/parents"} className="text-sm text-muted-foreground hover:underline">
          Cancel
        </Link>
      </div>
    </div>
  );
}
