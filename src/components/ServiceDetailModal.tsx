import { useEffect } from 'react';
import { motion } from 'framer-motion';
import type { ServiceDetail } from '../data/services';

interface ServiceDetailModalProps {
  service: ServiceDetail | null;
  onClose: () => void;
  onBookConsultation: (serviceName: string) => void;
}

export default function ServiceDetailModal({
  service,
  onClose,
  onBookConsultation,
}: ServiceDetailModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (service) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [service, onClose]);

  if (!service) return null;

  const getCategoryBadge = (cat: ServiceDetail['category']) => {
    switch (cat) {
      case 'strategy':
        return 'bg-deep-green/10 text-deep-green border-deep-green/20';
      case 'compliance':
        return 'bg-terracotta/15 text-terracotta border-terracotta/30';
      case 'talent':
        return 'bg-mint text-deep-green border-brand-green/30';
      case 'operations':
        return 'bg-brand-green/15 text-deep-green border-brand-green/30';
      default:
        return 'bg-mint text-deep-green border-brand-green/30';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-charcoal/75 backdrop-blur-md overflow-y-auto">
      <div className="fixed inset-0" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.25 }}
        className="relative z-10 bg-white rounded-[24px] max-w-[760px] w-full max-h-[90vh] overflow-y-auto shadow-elevated border border-charcoal/10 my-auto text-left"
      >
        {/* Close Button: sticky so it stays reachable while the modal scrolls.
            The wrapper has no height, so the button floats over the header
            instead of pushing it down. */}
        <div className="pointer-events-none sticky top-0 z-30 flex h-0 justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="pointer-events-auto mt-4 mr-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-deep-green shadow-md ring-1 ring-charcoal/10 transition-colors motion-reduce:transition-none hover:bg-mint focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green cursor-pointer"
          >
            <svg
              className="h-4 w-4 stroke-current fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Header */}
        <div className="bg-deep-green p-6 md:p-8 text-white relative">
          <div className="pr-8">
            <span
              className={`inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-2.5 ${getCategoryBadge(
                service.category,
              )}`}
            >
              Specialised HR practice &bull; {service.category.toUpperCase()}
            </span>
            <h3 className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-semibold leading-tight mb-2">
              {service.name}
            </h3>
            <p className="font-[family-name:var(--font-body)] text-white/85 text-xs md:text-sm leading-relaxed">
              {service.tagline}
            </p>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 md:p-8 space-y-6">
          {/* Detailed Overview */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-deep-green mb-2">
              What this service covers
            </h4>
            <p className="font-[family-name:var(--font-body)] text-charcoal/80 text-sm md:text-base leading-relaxed">
              {service.description}
            </p>
          </div>

          {/* Meta Cards: Timeline & Target */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="bg-cream/50 rounded-[14px] p-4 border border-charcoal/10">
              <div className="flex items-center gap-2 text-xs font-semibold text-charcoal/60 uppercase tracking-wider mb-1">
                <svg className="w-4 h-4 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                Typical Engagement Timeline
              </div>
              <p className="font-[family-name:var(--font-heading)] font-semibold text-charcoal text-sm">
                {service.timeline}
              </p>
            </div>

            <div className="bg-cream/50 rounded-[14px] p-4 border border-charcoal/10">
              <div className="flex items-center gap-2 text-xs font-semibold text-charcoal/60 uppercase tracking-wider mb-1">
                <svg className="w-4 h-4 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
                Who it suits
              </div>
              <p className="font-[family-name:var(--font-heading)] font-semibold text-charcoal text-sm">
                {service.targetAudience}
              </p>
            </div>
          </div>

          {/* Key Deliverables */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-deep-green mb-3">
              What you get
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {service.deliverables.map((del, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2.5 bg-mint/30 rounded-[12px] p-3 border border-brand-green/20"
                >
                  <span className="w-5 h-5 rounded-full bg-mint text-deep-green flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 stroke-current fill-none stroke-2.5 stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <span className="text-xs md:text-sm text-charcoal font-medium leading-snug">
                    {del}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Business Outcomes */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-deep-green mb-2.5">
              What it changes for you
            </h4>
            <ul className="space-y-2">
              {service.businessOutcomes.map((out, i) => (
                <li key={i} className="flex items-start gap-2.5 text-xs md:text-sm text-charcoal/75 leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-terracotta mt-2 flex-shrink-0" />
                  <span>{out}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-charcoal/10 flex flex-col sm:flex-row items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-2.5 bg-cream text-charcoal text-xs font-semibold rounded-full hover:bg-charcoal/10 transition-all border border-charcoal/15 cursor-pointer text-center"
            >
              Back to all services
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onBookConsultation(service.name);
              }}
              className="w-full sm:w-auto px-7 py-3 bg-brand-green text-white text-xs md:text-sm font-semibold rounded-full hover:bg-terracotta transition-all shadow-sm cursor-pointer text-center"
            >
              Book a consultation about {service.name} →
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
