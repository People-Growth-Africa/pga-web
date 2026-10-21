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
