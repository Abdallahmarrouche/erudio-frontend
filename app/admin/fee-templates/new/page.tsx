// app/admin/fee-templates/new/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

const FEE_TEMPLATES_ENDPOINT = "/accounts/fee-templates";
const YEARS_ENDPOINT = "/shared/academic-years";
const CLASS_LEVELS_ENDPOINT = "/shared/class-levels";
const inputCls = "w-full rounded-md border px-2 py-1.5 text-sm";

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
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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

export default function NewFeeTemplatePage() {
  const router = useRouter();
  const [years, setYears] = useState<Record<string, unknown>[]>([]);
  const [levels, setLevels] = useState<Record<string, unknown>[]>([]);
  const [templates, setTemplates] = useState<Record<string, unknown>[]>([]);
  const [f, setF] = useState({
    academicYearId: "",
    classLevelId: "",
    name: "",
    billingFrequency: "monthly",
    tuitionYearly: "",
    tuitionTermly: "",
    tuitionMonthly: "",
    copyItemsFromTemplateId: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [y, l, t] = await Promise.all([
        apiFetch(YEARS_ENDPOINT).catch(() => null),
        apiFetch(CLASS_LEVELS_ENDPOINT).catch(() => null),
        apiFetch(FEE_TEMPLATES_ENDPOINT).catch(() => null),
      ]);
      if (cancelled) return;
      setYears(toRows(y));
      setLevels(toRows(l));
      setTemplates(toRows(t));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function set(k: keyof typeof f, v: string) {
    setF((p) => ({ ...p, [k]: v }));
    setError(null);
  }

  async function submit() {
    setError(null);
    if (!f.academicYearId) return setError("Choose an academic year.");
    if (!f.classLevelId) return setError("Choose a class level.");
    if (!f.name.trim()) return setError("Name is required.");
    if (!f.copyItemsFromTemplateId) return setError("Choose a template to copy fee items from.");

    setSaving(true);
    try {
      const res = (await apiFetch(FEE_TEMPLATES_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({
          academicYearId: f.academicYearId,
          classLevelId: f.classLevelId,
          name: f.name.trim(),
          billingFrequency: f.billingFrequency,
          tuitionYearly: num(f.tuitionYearly),
          tuitionTermly: num(f.tuitionTermly),
          tuitionMonthly: num(f.tuitionMonthly),
          copyItemsFromTemplateId: f.copyItemsFromTemplateId,
        }),
      })) as Record<string, unknown>;
      void res;
      router.push("/admin/fee-templates");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t create the fee template.");
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <Link href="/admin/fee-templates" className="text-sm text-muted-foreground hover:underline">
          ← Back to fee pricing
        </Link>
        <h1 className="mt-3 text-2xl font-bold">New fee template</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Creates a template for a class level in an academic year. Fee items (registration, meals,
          ECA, and the tuition revenue account) are copied from an existing template — set the new
          tuition prices below.
        </p>

        {error && (
          <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Academic year" required>
            <select className={inputCls} value={f.academicYearId} disabled={saving} onChange={(e) => set("academicYearId", e.target.value)}>
              <option value="">Select…</option>
              {years.map((y) => {
                const id = String(y.id ?? "");
                return <option key={id} value={id}>{String(y.name ?? y.year ?? id)}</option>;
              })}
            </select>
          </Field>
          <Field label="Class level" required>
            <select className={inputCls} value={f.classLevelId} disabled={saving} onChange={(e) => set("classLevelId", e.target.value)}>
              <option value="">Select…</option>
              {levels.map((l) => {
                const id = String(l.id ?? "");
                const label = String(l.name ?? l.code ?? id);
                return <option key={id} value={id}>{label}</option>;
              })}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Template name" required>
              <input className={inputCls} value={f.name} disabled={saving} placeholder="e.g. KG1 2025/2026" onChange={(e) => set("name", e.target.value)} />
            </Field>
          </div>
          <Field label="Billing frequency">
            <select className={inputCls} value={f.billingFrequency} disabled={saving} onChange={(e) => set("billingFrequency", e.target.value)}>
              <option value="monthly">Monthly</option>
              <option value="termly">Termly</option>
              <option value="yearly">Yearly</option>
            </select>
          </Field>
          <div />
          <Field label="Tuition — yearly">
            <input type="number" min={0} step="0.01" className={inputCls} value={f.tuitionYearly} disabled={saving} onChange={(e) => set("tuitionYearly", e.target.value)} />
          </Field>
          <Field label="Tuition — termly">
            <input type="number" min={0} step="0.01" className={inputCls} value={f.tuitionTermly} disabled={saving} onChange={(e) => set("tuitionTermly", e.target.value)} />
          </Field>
          <Field label="Tuition — monthly (per month)">
            <input type="number" min={0} step="0.01" className={inputCls} value={f.tuitionMonthly} disabled={saving} onChange={(e) => set("tuitionMonthly", e.target.value)} />
          </Field>
          <div />
          <div className="sm:col-span-2">
            <Field label="Copy fee items from" required>
              <select className={inputCls} value={f.copyItemsFromTemplateId} disabled={saving} onChange={(e) => set("copyItemsFromTemplateId", e.target.value)}>
                <option value="">Select a template to copy items from…</option>
                {templates.map((t) => {
                  const id = String(t.id ?? "");
                  const label = `${String(t.name ?? id)} — ${String(t.classLevel ?? "")} ${String(t.academicYear ?? "")}`.trim();
                  return <option key={id} value={id}>{label}</option>;
                })}
              </select>
              <span className="mt-1 block text-xs text-muted-foreground">
                Registration / meals / ECA lines and the tuition revenue account come from this template.
              </span>
            </Field>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button onClick={submit} disabled={saving}>
            {saving ? "Creating…" : "Create template"}
          </Button>
          <Link href="/admin/fee-templates" className="text-sm text-muted-foreground hover:underline">
            Cancel
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
