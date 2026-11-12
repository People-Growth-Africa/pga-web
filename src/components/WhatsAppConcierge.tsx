import { useState } from 'react';

/**
 * The floating WhatsApp card. It is plain markup plus a CSS entrance now; this
 * sits on every public page, so pulling a motion library in for a 200ms scale
 * was not worth the download.
 */
export default function WhatsAppConcierge() {
  const [isOpen, setIsOpen] = useState(false);

  const phoneNumber = '2349167114560';
  const defaultMessage = encodeURIComponent(
    'Hello People Growth Africa, I would like to enquire about your HR and people advisory services.',
  );
  const waUrl = `https://wa.me/${phoneNumber}?text=${defaultMessage}`;

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end">
      {isOpen && (
        <div className="concierge-enter mb-3 w-80 bg-white rounded-[20px] shadow-elevated border border-charcoal/10 overflow-hidden text-left">
          <div className="bg-deep-green p-4 text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-mint/20 flex items-center justify-center text-mint font-bold text-xs">
                PGA
              </div>
              <div>
                <h5 className="font-[family-name:var(--font-body)] text-xs font-semibold leading-tight">
                  Advisory concierge
                </h5>
                <span className="text-[0.65rem] text-mint flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse" />
                  Available now (WAT)
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close concierge"
              className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer text-xs"
            >
              &times;
            </button>
          </div>

          <div className="p-4 space-y-3">
            <p className="text-xs text-charcoal/75 leading-relaxed">
              Message a People Growth Africa advisor about an HR question, or get urgent labour compliance guidance.
            </p>

            <div className="text-[0.7rem] text-charcoal/60 bg-cream/60 p-2.5 rounded-[10px] space-y-1">
              <div><strong>Mon &ndash; Fri:</strong> 8:00 AM &ndash; 6:00 PM WAT</div>
              <div><strong>Saturday:</strong> 11:00 AM &ndash; 4:00 PM WAT</div>
            </div>

            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-[#25D366] text-white text-xs font-semibold rounded-full hover:bg-[#1EBE5D] transition-all shadow-sm cursor-pointer"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
              </svg>
              <span>Start a WhatsApp chat</span>
            </a>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle WhatsApp chat concierge"
        aria-expanded={isOpen}
        className="w-14 h-14 rounded-full bg-[#25D366] text-white shadow-elevated flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-200 motion-reduce:transition-none cursor-pointer relative ring-4 ring-white/80"
      >
        <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
        </svg>
        <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-brand-green border-2 border-white rounded-full" />
      </button>
    </div>
  );
}
