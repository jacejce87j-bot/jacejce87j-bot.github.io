import { useCallback, useEffect, useState } from 'react';
import type { AuthUser } from '@workspace/api-client-react';

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
}

function getBasePath() {
  const baseUrl = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return baseUrl.replace(/\/+$/, '') || '/';
}

function navigateToAuth(url: string) {
  // Replit Preview renders artifacts inside a sandboxed iframe, so the top
  // frame cannot be scripted (window.top access throws, and synthetic
  // '_top' anchor clicks are silently blocked). Navigate the preview frame
  // itself: /api/login returns a 302 straight into the Replit OIDC
  // provider, which completes the handoff in the same window.
  window.location.assign(url);
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/auth/user', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ user: AuthUser | null }>;
      })
      .then((data) => {
        if (!cancelled) {
          setUser(data.user ?? null);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(() => {
    const base = getBasePath();
    const loginUrl = new URL(
      `/api/login?returnTo=${encodeURIComponent(base)}`,
      window.location.origin,
    ).href;
    navigateToAuth(loginUrl);
  }, []);

  const logout = useCallback(() => {
    const base = getBasePath();
    const logoutUrl = new URL(
      `/api/logout?returnTo=${encodeURIComponent(base)}`,
      window.location.origin,
    ).href;
    navigateToAuth(logoutUrl);
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  };
}
