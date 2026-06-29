// app/parents/[id]/edit/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";
import { ParentForm, type ParentFormValues } from "@/components/parent-form";

const PARENTS_ENDPOINT = "/accounts/parents";

function unwrap(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    for (const key of ["data", "parent", "result", "item"]) {
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

export default function EditParentPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [initial, setInitial] = useState<Partial<ParentFormValues> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const p = unwrap(await apiFetch(`${PARENTS_ENDPOINT}/${encodeURIComponent(id)}`));
        if (cancelled) return;
        if (!p) {
          setError("Parent not found.");
        } else {
          setInitial({
            parentType: s(p.parentType) || "father",
            firstName: s(p.firstName),
            lastName: s(p.lastName),
            email: s(p.email),
            phone: s(p.phone),
            phone2: s(p.phone2),
            phone3: s(p.phone3),
            country: s(p.country),
            emiratesId: s(p.idType) === "passport" ? "" : s(p.idNumber),
            passportNumber: s(p.passportNumber),
            notes: s(p.notes),
            spouseFirstName: s(p.spouseFirstName),
            spouseLastName: s(p.spouseLastName),
            spousePhone: s(p.spousePhone),
            spouseEmail: s(p.spouseEmail),
            spouseEmiratesId: s(p.spouseIdType) === "passport" ? "" : s(p.spouseIdNumber),
            spousePassportNumber: s(p.spousePassportNumber),
          });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load parent");
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
        <Link href={`/parents/${encodeURIComponent(id)}`} className="text-sm text-muted-foreground hover:underline">
          ← Back to parent
        </Link>
        <h1 className="mt-3 mb-6 text-2xl font-bold">Edit parent</h1>
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>
      {!loading && !error && initial && <ParentForm mode="edit" parentId={id} initial={initial} />}
    </AppShell>
  );
}
