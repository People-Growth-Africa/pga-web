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
  const isPortalSurface =
    pathname === '/admin' ||
    pathname === '/admin/stats' ||
    pathname === '/admin/data' ||
    pathname === '/admin/content' ||
    pathname === '/admin/staff' ||
    pathname === '/admin/registrations' ||
    pathname === '/content';

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
        <WhatsAppConcierge />
      </div>
    </ConsultationProvider>
  );
}
