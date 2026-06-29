// lib/api.ts
// Central API client for the Erudio backend.
// Everything that talks to Azure Functions goes through apiFetch().

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

const TOKEN_KEY = "erudio_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

/**
 * Thin fetch wrapper.
 * - Prefixes NEXT_PUBLIC_API_BASE_URL
 * - Attaches `Authorization: Bearer <token>` if a token is stored
 * - Throws ApiError on non-2xx so callers can try/catch
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      message = data.message ?? data.error ?? message;
    } catch {
      /* error body wasn't JSON — keep the default message */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// --- Login ------------------------------------------------------------------
export interface LoginResponse {
  token?: string;
  accessToken?: string;
  access_token?: string;
  jwt?: string;
  data?: { token?: string; accessToken?: string };
  user?: { id?: string; email?: string; name?: string };
}

export async function login(
  email: string,
  password: string
): Promise<LoginResponse> {
  const data = await apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  // Handles the common token field names automatically.
  const token =
    data.token ??
    data.accessToken ??
    data.access_token ??
    data.jwt ??
    data.data?.token ??
    data.data?.accessToken;

  if (!token) {
    throw new Error(
      "Login returned 200 but no token field was found. " +
        "Open the browser Network tab to see the response shape."
    );
  }

  setToken(token);
  return data;
}