// lib/resource.ts
import { apiFetch } from "@/lib/api";

export interface ListResult<T> {
  rows: T[];
  matched: boolean; // true if we found an array in the response
  raw: unknown; // the untouched response, for when matched is false
}

// Common wrapper keys an API might nest a list under.
const LIST_KEYS = [
  "data",
  "items",
  "value",
  "results",
  "records",
  "students",
  "parents",
  "rows",
];

/**
 * Fetches a list endpoint and digs the array out, whether the API returns a
 * bare array or wraps it (e.g. { data: [...] } or { items: [...] }).
 * If no array is found, matched=false and `raw` holds the response so the UI
 * can show it for shape-matching.
 */
export async function fetchList<T = Record<string, unknown>>(
  path: string
): Promise<ListResult<T>> {
  const raw = await apiFetch<unknown>(path);

  if (Array.isArray(raw)) return { rows: raw as T[], matched: true, raw };

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of LIST_KEYS) {
      if (Array.isArray(obj[key])) {
        return { rows: obj[key] as T[], matched: true, raw };
      }
    }
  }

  return { rows: [], matched: false, raw };
}
