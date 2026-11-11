import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import WhatsAppConcierge from './WhatsAppConcierge';
import { ConsultationProvider } from '../context/ConsultationContext';
import { finishFirstPaint } from '../lib/firstPaint';
import { useConsultation } from '../hooks/useConsultation';

const ConsultationModal = lazy(() => import('./ConsultationModal'));
const MonthGreetingPopover = lazy(() => import('./MonthGreetingPopover'));

/** The campaign's window, WAT. Kept here so the chunk is not requested at all
 *  outside it: the card is a November greeting, not a permanent part of the
 *  site. */
const GREETING_FROM = Date.parse('2026-11-01T00:00:00+01:00');
const GREETING_UNTIL = Date.parse('2026-11-03T12:00:00+01:00');

function DeferredConsultationModal() {
  const { isOpen } = useConsultation();
  if (!isOpen) return null;

  return (
    <Suspense fallback={null}>
      <ConsultationModal />
    </Suspense>
  );
}

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { pathname } = useLocation();
  const [showGreeting, setShowGreeting] = useState(false);

  useEffect(() => {
    const now = Date.now();
    if (now >= GREETING_FROM && now < GREETING_UNTIL) setShowGreeting(true);
  }, []);

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // Runs after the tree that hydrated has rendered, so everything that was
  // already in the prerendered HTML kept its finished state. Anything mounted
  // from here on - a navigation to another page - animates normally.
  useEffect(() => {
    finishFirstPaint();
  }, []);

  // The staff portals have their own full-screen shell; the public navigation,
  // footer and concierge would only frame a workspace that is not the website.
  // The sign-in and set-password screens keep the site chrome so they still
  // feel like a way into People Growth Africa rather than a separate product.
  //
  // Every screen under the two portal prefixes is matched here rather than
  // listed one by one: a page added later is framed correctly without anyone
  // remembering this file, which is what left the public navigation sitting on
  // top of the content oversight table.
  const isStaffPath =
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/content' ||
    pathname.startsWith('/content/');

  const isSignInScreen =
    pathname.startsWith('/admin/login') ||
    pathname.startsWith('/admin/set-password') ||
    pathname.startsWith('/content/login') ||
    pathname.startsWith('/content/set-password');

  const isPortalSurface = isStaffPath && !isSignInScreen;

  if (isPortalSurface) {
    return (
      <ConsultationProvider>
        <div className="min-h-screen">{children}</div>
      </ConsultationProvider>
    );
  }

  return (
    <ConsultationProvider>
      <div className="min-h-screen flex flex-col relative">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
        <DeferredConsultationModal />
        {/* A dated greeting, not part of the site: it decides for itself whether
            its window is open, and never meets anyone in a staff workspace. */}
        {!isStaffPath && showGreeting && (
          <Suspense fallback={null}>
            <MonthGreetingPopover />
          </Suspense>
        )}
        {/* The floating concierge is an offer to talk about the website, not
            part of a staff workspace; it stays off every /admin and /content
            page, sign-in screens included. */}
        {!isStaffPath && <WhatsAppConcierge />}
      </div>
    </ConsultationProvider>
  );
}
