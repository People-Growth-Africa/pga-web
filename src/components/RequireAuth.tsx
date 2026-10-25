import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { dashboardPath, type Role } from '../lib/authClient';
import { AUTH_ENABLED } from '../config/signup-links';
import DashboardSkeleton from './dashboard/DashboardSkeleton';

/**
 * Route guard for signed in pages. The API checks the session on every request,
 * so this only decides what the visitor sees: a short wait, the log in page, or
 * their own dashboard.
 */
export default function RequireAuth({
  role,
  roles,
  children,
  signInPath = '/auth#login',
}: {
  role?: Role;
  /** Accepted roles when more than one may open the page. */
  roles?: Role[];
  children: ReactNode;
  /**
   * Where a signed out visitor is sent. The content admin has its own sign-in
   * page, because the public `/auth` screen is deliberately closed on
   * peoplegrowthafrica.com; every other guarded page keeps the normal one.
   */
  signInPath?: string;
}) {
  const { status, user } = useAuth();
  const location = useLocation();

  // With accounts off there is no one to log in, so a guarded page sends the
  // visitor home rather than to a sign in form that no longer exists.
  if (!AUTH_ENABLED) {
    return <Navigate to="/" replace />;
  }

  if (status === 'loading') {
    // Skeleton loading rather than a line of text on an empty page: the shapes
    // of the real layout say what is coming and the page settles instead of
    // jumping (9.2).
    return <DashboardSkeleton />;
  }

  if (!user) {
    return <Navigate to={signInPath} replace state={{ from: location.pathname }} />;
  }

  const allowed = roles ?? (role ? [role] : []);
  if (allowed.length > 0 && !allowed.includes(user.role)) {
    return <Navigate to={dashboardPath(user.role)} replace />;
  }

  if (user.mustChangePassword && signInPath === '/admin/login') {
    return <Navigate to="/admin/set-password" replace />;
  }

  return <>{children}</>;
}
