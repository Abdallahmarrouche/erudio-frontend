// components/data-table.tsx
"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";

export function prettifyKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

const NAME_KEYS = [
  "fullName",
  "name",
  "title",
  "label",
  "displayName",
  "studentName",
  "parentName",
];

function objectName(obj: Record<string, unknown>): string | null {
  for (const k of NAME_KEYS) {
    if (typeof obj[k] === "string" && obj[k]) return obj[k] as string;
  }
  const first = obj.firstName ?? obj.first_name;
  const last = obj.lastName ?? obj.last_name;
  if (first || last) return [first, last].filter(Boolean).join(" ");
  return null;
}

// A short, human-readable version of an object (used instead of raw JSON).
function summarizeObject(obj: Record<string, unknown>): string {
  const name = objectName(obj);
  if (name) return name;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (/(^id$|Id$|_id$)/.test(k)) continue; // skip noisy ids
    if (v === null || v === undefined || v === "" || typeof v === "object")
      continue;
    parts.push(String(v));
    if (parts.length >= 3) break;
  }
  return parts.length ? parts.join(" · ") : "{…}";
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (typeof value[0] === "object")
      return `${value.length} item${value.length === 1 ? "" : "s"}`;
    return value.map((v) => String(v)).join(", ");
  }
  if (typeof value === "object")
    return summarizeObject(value as Record<string, unknown>);
  return String(value);
}

// Decide where a nested entity links to, based on the field name.
function entityHref(key: string, id: string): string | null {
  if (/parent|guardian/i.test(key)) return `/parents/${encodeURIComponent(id)}`;
  if (/student|child|pupil/i.test(key))
    return `/students/${encodeURIComponent(id)}`;
  return null;
}

/**
 * Renders one field value for detail views. Nested parent/student objects
 * become links to their own pages; everything else renders neatly.
 */
export function FieldValue({
  fieldKey,
  value,
}: {
  fieldKey: string;
  value: unknown;
}) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const idVal = obj.id ?? obj.Id ?? obj.ID;
    const label = summarizeObject(obj);
    if (idVal !== undefined && idVal !== null && idVal !== "") {
      const href = entityHref(fieldKey, String(idVal));
      if (href) {
        return (
          <Link
            href={href}
            className="text-primary underline underline-offset-2 hover:opacity-80"
          >
            {label}
          </Link>
        );
      }
    }
    return <span>{label}</span>;
  }

  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object") {
    return (
      <span>
        {(value as Record<string, unknown>[])
          .map((o) => objectName(o) ?? summarizeObject(o))
          .join(", ")}
      </span>
    );
  }

  return <span>{formatValue(value)}</span>;
}

interface DataTableProps {
  rows: Record<string, unknown>[];
  /** Return a URL to make a row clickable, or null to leave it static. */
  getRowHref?: (row: Record<string, unknown>) => string | null;
}

export function DataTable({ rows, getRowHref }: DataTableProps) {
  const router = useRouter();

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No records found.</p>;
  }

  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="whitespace-nowrap px-4 py-2 text-left font-medium text-muted-foreground"
              >
                {prettifyKey(col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const href = getRowHref?.(row) ?? null;
            return (
              <tr
                key={i}
                onClick={href ? () => router.push(href) : undefined}
                className={
                  "border-b last:border-0 " +
                  (href
                    ? "cursor-pointer hover:bg-muted/40"
                    : "hover:bg-muted/30")
                }
              >
                {columns.map((col) => (
                  <td key={col} className="whitespace-nowrap px-4 py-2">
                    {formatValue(row[col])}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
