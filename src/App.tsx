import { lazy, useEffect, useState, type ComponentType } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ConfirmProvider } from './components/ConfirmDialog';
import Home from './pages/Home';
import SiteShell from './SiteShell';
import type { RouteComponents } from './routeComponents';

const routeComponents: RouteComponents = {
  Signup: lazy(() => import('./pages/Signup')),
  Home,
  Events: lazy(() => import('./pages/Events')),
  BlogList: lazy(() => import('./pages/BlogList')),
  BlogPost: lazy(() => import('./pages/BlogPost')),
  EventDetail: lazy(() => import('./pages/EventDetail')),
  BookConsultation: lazy(() => import('./pages/BookConsultation')),
  Auth: lazy(() => import('./pages/Auth')),
  ForgotPassword: lazy(() => import('./pages/ForgotPassword')),
  VerifyEmail: lazy(() => import('./pages/VerifyEmail')),
  NewsletterConfirm: lazy(() => import('./pages/NewsletterConfirm')),
  TalentDashboard: lazy(() => import('./pages/TalentDashboard')),
  EmployerDashboard: lazy(() => import('./pages/EmployerDashboard')),
  AdminContent: lazy(() => import('./pages/admin/AdminContent')),
  AdminData: lazy(() => import('./pages/admin/AdminData')),
  AdminAuditLog: lazy(() => import('./pages/admin/AdminAuditLog')),
  AdminTrafficBotRules: lazy(() => import('./pages/admin/TrafficBotRules')),
  AdminAccess: lazy(() => import('./pages/admin/AdminAccess')),
  AdminMyAccess: lazy(() => import('./pages/admin/AdminMyAccess')),
  AdminNotifications: lazy(() => import('./pages/admin/AdminNotifications')),
  AdminRetention: lazy(() => import('./pages/admin/AdminRetention')),
  AdminOversight: lazy(() => import('./pages/admin/AdminOversight')),
  AdminSetPassword: lazy(() => import('./pages/admin/AdminSetPassword')),
  AdminStaff: lazy(() => import('./pages/admin/AdminStaff')),
  AdminSecurity: lazy(() => import('./pages/admin/AdminSecurity')),
  AdminStats: lazy(() => import('./pages/admin/AdminStats')),
  AdminEmailTemplates: lazy(() => import('./pages/admin/AdminEmailTemplates')),
  ManagerLogin: lazy(() => import('./pages/admin/ManagerLogin')),
  Terms: lazy(() => import('./pages/Terms')),
  Privacy: lazy(() => import('./pages/Privacy')),
  NotFound: lazy(() => import('./pages/NotFound')),
};

interface AppProps {
  initialRouteComponents?: Partial<RouteComponents>;
}

function DeferredAnalytics() {
  const [AnalyticsView, setAnalyticsView] = useState<ComponentType | null>(null);

  useEffect(() => {
    let timeoutId: number | undefined;
    let cancelled = false;
    let requested = false;

    const load = () => {
      if (requested) return;
      requested = true;
      import('@vercel/analytics/react')
        .then(({ Analytics }) => {
          if (!cancelled) setAnalyticsView(() => Analytics);
        })
        .catch((error: unknown) => {
          console.error('Unable to load Vercel Analytics.', error);
        });
    };
    const schedule = () => {
      timeoutId = window.setTimeout(load, 1000);
    };

    window.addEventListener('load', schedule, { once: true });
    document.addEventListener('pointerdown', load, { once: true, passive: true });
    document.addEventListener('keydown', load, { once: true });
    if (document.readyState === 'complete') schedule();

    return () => {
      cancelled = true;
      window.removeEventListener('load', schedule);
      document.removeEventListener('pointerdown', load);
      document.removeEventListener('keydown', load);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  return AnalyticsView ? <AnalyticsView /> : null;
}

/**
 * The browser entry point. The routes and layout live in SiteShell, because the
 * build renders the same tree through StaticRouter; this file adds only the
 * pieces that belong to a live browser session.
 */
export default function App({ initialRouteComponents }: AppProps) {
  const activeRouteComponents = initialRouteComponents
    ? { ...routeComponents, ...initialRouteComponents }
    : routeComponents;

  return (
    <ConfirmProvider>
      <BrowserRouter>
        <SiteShell routeComponents={activeRouteComponents} />
        <DeferredAnalytics />
      </BrowserRouter>
    </ConfirmProvider>
  );
}
