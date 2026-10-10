import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthContext, type AuthStatus } from './AuthContextDef';
import { authRequest, type AuthUser, type Role } from '../lib/authClient';
import { AUTH_ENABLED } from '../config/signup-links';

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
    return next;
  }, [loadSession]);

  useEffect(() => {
    // Accounts are off: skip the session request entirely. The status already
    // starts as 'signedOut' above, so nothing needs setting here.
    if (!AUTH_ENABLED) return;

    let active = true;
    void (async () => {
      const next = await loadSession();
      if (!active) return;
      setUser(next);
      setStatus(next ? 'signedIn' : 'signedOut');
    })();
    return () => {
      active = false;
    };
  }, [loadSession]);

  const signOut = useCallback(async () => {
    await authRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST', body: {} });
    setUser(null);
    setStatus('signedOut');
  }, []);

  const applyUser = useCallback((next: AuthUser) => {
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
