import { StaticRouter } from 'react-router';
import SiteShell from './SiteShell';
import Signup from './pages/Signup';
import Home from './pages/Home';
import Events from './pages/Events';
import BlogList from './pages/BlogList';
import BlogPost from './pages/BlogPost';
import EventDetail from './pages/EventDetail';
import BookConsultation from './pages/BookConsultation';
import Auth from './pages/Auth';
import ForgotPassword from './pages/ForgotPassword';
import VerifyEmail from './pages/VerifyEmail';
import NewsletterConfirm from './pages/NewsletterConfirm';
import TalentDashboard from './pages/TalentDashboard';
import EmployerDashboard from './pages/EmployerDashboard';
import AdminContent from './pages/admin/AdminContent';
import AdminData from './pages/admin/AdminData';
import AdminAuditLog from './pages/admin/AdminAuditLog';
import AdminTrafficBotRules from './pages/admin/TrafficBotRules';
import AdminAccess from './pages/admin/AdminAccess';
import AdminMyAccess from './pages/admin/AdminMyAccess';
import AdminNotifications from './pages/admin/AdminNotifications';
import AdminRetention from './pages/admin/AdminRetention';
import AdminOversight from './pages/admin/AdminOversight';
import AdminSetPassword from './pages/admin/AdminSetPassword';
import AdminStaff from './pages/admin/AdminStaff';
import AdminSecurity from './pages/admin/AdminSecurity';
import AdminStats from './pages/admin/AdminStats';
import AdminEmailTemplates from './pages/admin/AdminEmailTemplates';
import ManagerLogin from './pages/admin/ManagerLogin';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import NotFound from './pages/NotFound';
import type { RouteComponents } from './routeComponents';

const routeComponents: RouteComponents = {
  Signup,
  Home,
  Events,
  BlogList,
  BlogPost,
  EventDetail,
  BookConsultation,
  Auth,
  ForgotPassword,
  VerifyEmail,
  NewsletterConfirm,
  TalentDashboard,
  EmployerDashboard,
  AdminContent,
  AdminData,
  AdminAuditLog,
  AdminTrafficBotRules,
  AdminAccess,
  AdminMyAccess,
  AdminNotifications,
  AdminRetention,
  AdminOversight,
  AdminSetPassword,
  AdminStaff,
  AdminSecurity,
  AdminStats,
  AdminEmailTemplates,
  ManagerLogin,
  Terms,
  Privacy,
  NotFound,
};

/**
 * The app, rendered at a URL by the build. Never shipped to the browser.
 *
 * scripts/prerender.mjs builds this file with Vite's SSR mode and renders it
 * once per public route. It is the same SiteShell the browser hydrates, so the
 * shipped HTML is the app rather than a hand-written approximation of it.
 *
 * The metadata for each route lives in src/lib/pageMeta.ts, which is built as
 * its own entry (see vite.ssr.config.ts) and imported by the same script.
 */
export default function PrerenderApp({ url }: { url: string }) {
  return (
    <StaticRouter location={url}>
      <SiteShell routeComponents={routeComponents} />
    </StaticRouter>
  );
}
