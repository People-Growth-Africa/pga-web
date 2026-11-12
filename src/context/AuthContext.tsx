import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthContext, type AuthStatus } from './AuthContextDef';
import { authRequest, type AuthUser, type Role } from '../lib/authClient';
import { AUTH_ENABLED } from '../config/signup-links';

/**
 * The last session the browser saw, kept for this tab only.
 *
 * The server remains the authority: every API call checks the cookie, and the
 * background refresh below replaces or clears this copy. It exists so a repeat
 * visit can paint the dashboard immediately instead of waiting for /api/auth/me
 * before the first useful request can start.
 */
const SESSION_CACHE_KEY = 'pga.session.user.v1';

function readCachedUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthUser> | null;
    return parsed && typeof parsed.id === 'string' && typeof parsed.role === 'string'
      ? (parsed as AuthUser)
      : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: AuthUser | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (user) window.sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(user));
    else window.sessionStorage.removeItem(SESSION_CACHE_KEY);
  } catch {
    // A private window with storage disabled simply skips the shortcut.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // With accounts off there is no session to look up, so the shell starts as
  // signed out rather than briefly 'loading' for a request that will not run.
  const [status, setStatus] = useState<AuthStatus>(AUTH_ENABLED ? 'loading' : 'signedOut');
  const [user, setUser] = useState<AuthUser | null>(null);

  // Any failure here (signed out, expired session, network) means the shell
  // should act as signed out rather than block the page.
  const loadSession = useCallback(async (): Promise<AuthUser | null> => {
    const result = await authRequest<{ user: AuthUser }>('/api/auth/me', { method: 'GET' });
    return result.ok ? (result.data.user ?? null) : null;
  }, []);

  const refresh = useCallback(async (): Promise<AuthUser | null> => {
    const next = await loadSession();
    setUser(next);
    setStatus(next ? 'signedIn' : 'signedOut');
    writeCachedUser(next);
    return next;
  }, [loadSession]);

  useEffect(() => {
    // Accounts are off: skip the session request entirely. The status already
    // starts as 'signedOut' above, so nothing needs setting here.
    if (!AUTH_ENABLED) return;

    // Paint the last known session first, then confirm it with the server.
    const cached = readCachedUser();
    if (cached) {
      setUser(cached);
      setStatus('signedIn');
    }

    let active = true;
    void (async () => {
      const next = await loadSession();
      if (!active) return;
      setUser(next);
      setStatus(next ? 'signedIn' : 'signedOut');
      writeCachedUser(next);
    })();
    return () => {
      active = false;
    };
  }, [loadSession]);

  const signOut = useCallback(async () => {
    await authRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST', body: {} });
    writeCachedUser(null);
    setUser(null);
    setStatus('signedOut');
  }, []);

  const applyUser = useCallback((next: AuthUser) => {
    writeCachedUser(next);
    setUser(next);
    setStatus('signedIn');
  }, []);

  const value = useMemo(
    () => ({
      status,
      user,
      setUser: applyUser,
      refresh,
      signOut,
      hasRole: (role: Role) => user?.role === role,
    }),
    [status, user, applyUser, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
