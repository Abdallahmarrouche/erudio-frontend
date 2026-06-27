// components/data-table.tsx
"use client";

import { useRouter } from "next/navigation";

// Exported so the student detail page can reuse the same formatting.
export function prettifyKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

interface DataTableProps {
  rows: Record<string, unknown>[];
  /** Return a URL to make a row clickable, or null to leave it static. */
  getRowHref?: (row: Record<string, unknown>) => string | null;
}

/**
 * Renders any array of objects as a table. Columns are the union of all keys
 * across the rows. Pass getRowHref to make rows navigate on click.
 */
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
