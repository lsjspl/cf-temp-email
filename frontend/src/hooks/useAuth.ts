import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";

export interface AuthUser {
  id: string;
  email: string;
  username: string | null;
  role: "admin" | "user";
  status: "active" | "disabled";
}

interface AuthState {
  user: AuthUser | null;
  requiresSetup: boolean;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    requiresSetup: false,
    loading: true,
  });

  const check = useCallback(async () => {
    try {
      const data = await apiGet<{ user: AuthUser | null; requires_setup: boolean }>("/auth/me");
      setState({ user: data.user, requiresSetup: data.requires_setup, loading: false });
    } catch {
      setState({ user: null, requiresSetup: false, loading: false });
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  const logout = useCallback(async () => {
    await apiPost("/auth/logout");
    setState((s) => ({ ...s, user: null }));
  }, []);

  return { ...state, refresh: check, logout };
}
