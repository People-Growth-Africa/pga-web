import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import { staticPageMeta } from '../lib/pageMeta';
import AnimateOnScroll from '../components/AnimateOnScroll';
import EventCard from '../components/EventCard';
import EventRegistrationModal from '../components/EventRegistrationModal';
import { eventCategories, type EventItem } from '../data/events';
import { useContent } from '../hooks/useContent';
import { useLivePosts } from '../hooks/useLivePosts';
import { mergeEvents, splitEvents, type EventView } from '../lib/contentMerge';

/**
 * /events - the built-in programme catalogue, with events from the sheet added.
 *
 * The split into Upcoming and Past is about the event's own date, not about
 * whether it is published: an event is never hidden because its date has passed
 * or is far away. Built-in events keep the status they were written with, which
 * is why they still appear as upcoming; sheet events get their status from
 * event_date, so a finished one moves itself into Past events.
 */
export default function Events() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const { entries } = useContent();
  const live = useLivePosts();

  const allEvents = useMemo(() => mergeEvents(entries, live.posts), [entries, live.posts]);

  const filteredEvents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return allEvents.filter((event) => {
      const matchesCategory = selectedCategory === 'all' || event.type === selectedCategory;
      const matchesSearch =
        !query ||
        event.title.toLowerCase().includes(query) ||
        event.subtitle.toLowerCase().includes(query) ||
        event.speaker.name.toLowerCase().includes(query) ||
        event.targetAudience.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [allEvents, selectedCategory, searchQuery]);

  // Upcoming soonest first; past newest first.
  const { upcoming, past } = useMemo(() => splitEvents(filteredEvents), [filteredEvents]);

  const renderCard = (event: EventView) => (
    <AnimateOnScroll key={event.id} className="h-full">
      <EventCard
        event={event}
        featured={event.featured}
        detailHref={event.detailHref}
        isPast={event.isPast}
        registrationUrl={event.registrationUrl}
        onRegister={(ev) => setSelectedEvent(ev)}
      />
    </AnimateOnScroll>
  );

  return (
    <>
      <SEO meta={staticPageMeta('/events')} />

      {/* Hero Banner */}
      <section className="bg-deep-green text-white pt-[140px] pb-[80px] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-green/15 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-[1200px] mx-auto px-6 relative z-10">
          <AnimateOnScroll>
            <p className="font-[family-name:var(--font-body)] text-xs font-semibold uppercase tracking-[0.15em] text-mint mb-3">
              Practical &bull; Peer-led &bull; Built for Africa
            </p>
            <h1
              className="font-[family-name:var(--font-heading)] font-semibold text-white leading-[1.15] mb-5 max-w-[800px]"
              style={{ fontSize: 'clamp(2.4rem, 5vw, 3.8rem)' }}
            >
              Webinars, Masterclasses &amp; Mentorship Cohorts
            </h1>
            <p className="font-[family-name:var(--font-body)] text-white/80 text-base md:text-lg max-w-[680px] leading-relaxed mb-8">
              Practical sessions for African business leaders and HR practitioners: live masterclasses, compliance briefings and small mentorship cohorts.
            </p>
          </AnimateOnScroll>

          {/* Quick Metrics */}
          <AnimateOnScroll delay={0.1}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-[860px] pt-6 border-t border-white/15">
              <div>
                <span className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-bold text-mint block">
                  100%
                </span>
                <span className="text-xs text-white/70">Practical case studies</span>
              </div>
              <div>
                <span className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-bold text-mint block">
                  Pan-African
                </span>
                <span className="text-xs text-white/70">Nigerian and African legal context</span>
              </div>
              <div>
                <span className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-bold text-mint block">
                  1-on-1
                </span>
                <span className="text-xs text-white/70">Direct access to senior advisors</span>
              </div>
              <div>
                <span className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-bold text-mint block">
                  Capped
                </span>
                <span className="text-xs text-white/70">Small cohorts, kept small on purpose</span>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* Main Events Catalog */}
      <section className="py-[80px] bg-cream/40 min-h-[600px]">
        <div className="max-w-[1200px] mx-auto px-6">
          {/* Controls Bar: Category Filters & Search */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-10 pb-6 border-b border-charcoal/10">
            {/* Category Filter Pills - one flickable row on a phone, wrapping from md up */}
            <div className="flex flex-nowrap md:flex-wrap items-center gap-2 w-full md:w-auto overflow-x-auto md:overflow-visible scrollbar-none [&::-webkit-scrollbar]:hidden -mx-6 px-6 md:mx-0 md:px-0">
              {eventCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`shrink-0 whitespace-nowrap px-5 py-2.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-deep-green text-white shadow-sm'
                      : 'bg-white text-charcoal/70 hover:text-charcoal hover:bg-cream border border-charcoal/10'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="w-full md:w-72">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search topic or speaker…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-white rounded-full border border-charcoal/15 text-xs text-charcoal focus:outline-none focus:border-brand-green focus:ring-1 focus:ring-brand-green transition-all"
                />
                <svg
                  className="w-4 h-4 stroke-charcoal/40 fill-none stroke-2 stroke-linecap-round stroke-linejoin-round absolute left-3 top-3"
                  viewBox="0 0 24 24"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
            </div>
          </div>

          {filteredEvents.length > 0 ? (
            <>
              {/* Upcoming Events */}
              {upcoming.length > 0 && (
                <div className="mb-16">
                  <h2 className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-semibold text-charcoal mb-6">
                    Upcoming events
                  </h2>
                  {/* Four cards across on a large screen; tablets and phones keep
                      two and one column. */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                    {upcoming.map(renderCard)}
                  </div>
                </div>
              )}

              {/* Past Events */}
              {past.length > 0 && (
                <div>
                  <h2 className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-semibold text-charcoal mb-2">
                    Past events
                  </h2>
                  <p className="text-sm text-charcoal/55 mb-6">
                    Sessions that have already run. Each page keeps the details and any recording link.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                    {past.map(renderCard)}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-20 bg-white rounded-[20px] border border-charcoal/10 p-8">
              <h3 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-charcoal mb-2">
                No programmes found
              </h3>
              <p className="text-sm text-charcoal/60 max-w-md mx-auto mb-6">
                Nothing matches this filter. Try another category, or clear your search.
              </p>
              <button
                onClick={() => {
                  setSelectedCategory('all');
                  setSearchQuery('');
                }}
                className="px-6 py-2.5 bg-deep-green text-white text-xs font-semibold rounded-full hover:bg-brand-green transition-all cursor-pointer"
              >
                Show everything
              </button>
            </div>
          )}

          {/* Enterprise Custom Workshop CTA */}
          <div className="mt-16 bg-deep-green rounded-[24px] p-8 md:p-12 text-white relative overflow-hidden shadow-elevated">
            <div className="absolute -bottom-20 -right-20 w-80 h-80 rounded-full bg-brand-green/20 blur-3xl pointer-events-none" />
            <div className="relative z-10 max-w-2xl">
              <span className="inline-block px-3 py-1 rounded-full bg-white/10 text-mint text-xs font-semibold uppercase tracking-wider mb-3">
                Bespoke in-house programmes
              </span>
              <h3 className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-semibold leading-tight mb-3">
                Need training built for your own management team?
              </h3>
              <p className="font-[family-name:var(--font-body)] text-white/80 text-sm md:text-base leading-relaxed mb-6">
                We design internal training academies, Nigerian labour compliance workshops and manager programmes for organisations growing across Nigeria and Africa.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  to="/#contact"
                  className="px-7 py-3.5 bg-terracotta text-white text-xs md:text-sm font-semibold rounded-full hover:bg-brand-green transition-all shadow-sm"
                >
                  Request a proposal →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Registration Modal */}
      <EventRegistrationModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </>
  );
}
