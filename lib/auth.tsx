// lib/auth.tsx
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  getToken,
  clearToken,
  login as apiLogin,
  type LoginResponse,
} from "@/lib/api";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: LoginResponse["user"] | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

const USER_KEY = "erudio_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<LoginResponse["user"] | null>(null);

  // Read the token from localStorage after mount so SSR and the first client
  // render agree (no hydration mismatch).
  useEffect(() => {
    if (getToken()) {
      setIsAuthenticated(true);
      const stored = window.localStorage.getItem(USER_KEY);
      if (stored) {
        try {
          setUser(JSON.parse(stored));
        } catch {
          /* ignore malformed user blob */
        }
      }
    }
    setIsLoading(false);
  }, []);

  async function login(email: string, password: string) {
    const res = await apiLogin(email, password);
    setIsAuthenticated(true);
    setUser(res.user ?? null);
    if (res.user) {
      window.localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    }
  }

  function logout() {
    clearToken();
    window.localStorage.removeItem(USER_KEY);
    setIsAuthenticated(false);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, isLoading, user, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
