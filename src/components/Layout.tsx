import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import ConsultationModal from './ConsultationModal';
import WhatsAppConcierge from './WhatsAppConcierge';
import { ConsultationProvider } from '../context/ConsultationContext';
import { finishFirstPaint } from '../lib/firstPaint';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { pathname } = useLocation();

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
        <ConsultationModal />
        {/* The floating concierge is an offer to talk about the website, not
            part of a staff workspace; it stays off every /admin and /content
            page, sign-in screens included. */}
        {!isStaffPath && <WhatsAppConcierge />}
      </div>
    </ConsultationProvider>
  );
}
