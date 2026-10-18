import { memo } from 'react';
import type { EventItem } from '../data/events';

interface EventCardProps {
  event: EventItem;
  onRegister: (event: EventItem) => void;
  featured?: boolean;
}

/** Memoised because the carousel re-renders on every auto-advance: the cards
 *  themselves never change, so only the track's transform should cost work. */
function EventCard({ event, onRegister, featured = false }: EventCardProps) {
  const getTypeBadgeStyle = (type: EventItem['type']) => {
    switch (type) {
      case 'webinar':
        return 'bg-mint text-deep-green border-brand-green/30';
      case 'mentorship':
        return 'bg-terracotta/15 text-terracotta border-terracotta/30';
      case 'workshop':
        return 'bg-deep-green/10 text-deep-green border-deep-green/20';
      default:
        return 'bg-mint text-deep-green border-brand-green/30';
    }
  };

  /* h-full so every card in a grid row ends level with the tallest one, and no
     lift on hover: the cards are dense enough that the movement read as the row
     wobbling rather than as feedback. */
  return (
    <div
      className={`h-full bg-white rounded-[20px] p-6 flex flex-col justify-between border ${
        featured
          ? 'border-brand-green/40 shadow-card-hover relative ring-1 ring-brand-green/20'
          : 'border-charcoal/10 shadow-card'
      }`}
    >
      <div>
        {/* Badges & Meta */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 mb-4">
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border ${getTypeBadgeStyle(
              event.type,
            )}`}
          >
            {event.typeLabel}
          </span>
          <span className="text-xs font-medium text-charcoal/50">
            {event.seatsRemaining} places left
          </span>
        </div>

        {/* Date and Time */}
        <div className="flex items-center gap-2 text-xs font-semibold text-brand-green uppercase tracking-wider mb-2">
          <svg className="w-4 h-4 stroke-current fill-none stroke-2 stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span>{event.date} &bull; {event.time}</span>
        </div>

        {/* Title & Subtitle */}
        <h3 className="font-[family-name:var(--font-heading)] text-lg md:text-xl font-semibold text-charcoal leading-snug mb-2.5">
          {event.title}
        </h3>
        <p className="font-[family-name:var(--font-body)] text-sm text-charcoal/70 leading-relaxed mb-5">
          {event.subtitle}
        </p>

        {/* Format / Duration Info */}
        <div className="flex flex-wrap gap-2.5 mb-6 text-xs text-charcoal/65">
          <span className="inline-flex items-center gap-1.5 bg-cream/70 px-3 py-1.5 rounded-full border border-charcoal/10">
            <svg className="w-3.5 h-3.5 stroke-charcoal/60 fill-none stroke-2 stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {event.duration}
          </span>
          <span className="inline-flex items-center gap-1.5 bg-cream/70 px-3 py-1.5 rounded-full border border-charcoal/10">
            <svg className="w-3.5 h-3.5 stroke-charcoal/60 fill-none stroke-2 stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
              <path d="M23 7l-7 5 7 5V7z" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            {event.format}
          </span>
        </div>

        {/* Speaker Profile */}
        <div className="pt-4 border-t border-charcoal/10 flex items-center gap-3.5 mb-6">
          <div className="w-10 h-10 rounded-full bg-mint text-deep-green font-bold text-xs flex items-center justify-center border border-brand-green/30">
            {event.speaker.name.split(' ').map((n) => n[0]).join('')}
          </div>
          <div>
            <div className="text-xs font-semibold text-charcoal">{event.speaker.name}</div>
            <div className="text-[0.75rem] text-charcoal/55">{event.speaker.title}, {event.speaker.organization}</div>
          </div>
        </div>
      </div>

      {/* Footer / CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <span className="text-xs font-semibold text-charcoal/80 bg-cream/60 px-3 py-1.5 rounded-full">
          {event.price}
        </span>
        <button
          type="button"
          onClick={() => onRegister(event)}
          className="inline-flex items-center justify-center px-6 py-2.5 bg-deep-green text-white font-[family-name:var(--font-body)] text-xs font-semibold rounded-full hover:bg-brand-green transition-all duration-300 cursor-pointer shadow-sm"
        >
          {event.type === 'mentorship' ? 'Apply for a place →' : 'Register free →'}
        </button>
      </div>
    </div>
  );
}

export default memo(EventCard);
