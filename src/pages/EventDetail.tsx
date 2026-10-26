import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import AnimateOnScroll from '../components/AnimateOnScroll';
import EventCard from '../components/EventCard';
import EventRegistrationModal from '../components/EventRegistrationModal';
import EventShareButton from '../components/EventShareButton';
import SafeContent from '../components/SafeContent';
import PostBody from '../components/PostBody';
import SEO from '../components/SEO';
import NotFound from './NotFound';
import type { EventItem } from '../data/events';
import { isSafeHttpUrl } from '../lib/content';
import { findEvent, mergeEvents, splitEvents } from '../lib/contentMerge';
import { useContent } from '../hooks/useContent';
import { useLivePosts } from '../hooks/useLivePosts';
import { eventMeta } from '../lib/pageMeta';

/**
 * /events/:slug - one event, built-in or from the sheet.
 *
 * Built-in events already had a full description and speaker inside the
 * registration modal; this page gives every event a URL of its own so it can be
 * shared, indexed and described with Event structured data. The card still opens
 * the same modal for built-in programmes, so nothing about registering changed.
 *
 * A slug that is not in the built-in list and not in the sheet is the real 404
 * page. While the sheet is still being read, the page shows a neutral placeholder
 * instead, because "not found yet" is not the same as "not found".
 */
export default function EventDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { status, entries } = useContent();
  const live = useLivePosts();
  // The modal still takes an EventItem; an EventView is one, with extra facts.
  const [registering, setRegistering] = useState<EventItem | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  const event = slug ? findEvent(slug, entries, live.posts) : undefined;

  if (!event) {
    if (status === 'loading' || live.status === 'loading') {
      return (
        <>
          <SEO title="Event | People Growth Africa" description="A programme from People Growth Africa." />
          <section className="min-h-[60vh] bg-deep-green pb-[80px] pt-[160px]">
            <div className="mx-auto max-w-[800px] px-6" aria-busy="true">
              <p role="status" className="sr-only">
                Loading event…
              </p>
              <div className="mx-auto h-4 w-32 rounded-full bg-white/20" aria-hidden="true" />
              <div className="mx-auto mt-6 h-9 w-4/5 rounded-full bg-white/15" aria-hidden="true" />
            </div>
          </section>
        </>
      );
    }
    if (status === 'unavailable') {
      return (
        <>
          <SEO title="Event unavailable | People Growth Africa" description="This event could not be loaded." />
          <section className="flex min-h-[60vh] items-center justify-center bg-cream px-6 pt-24">
            <div className="max-w-[560px] rounded-[20px] border border-charcoal/8 bg-white p-10 text-center shadow-card">
              <h1 className="mb-2 font-[family-name:var(--font-heading)] text-2xl font-semibold text-charcoal">
                This event could not be loaded
              </h1>
              <p className="mb-6 font-[family-name:var(--font-body)] text-[0.95rem] leading-relaxed text-charcoal/60">
                The programme feed could not be reached just now. Reload the page in a moment, or
                see every event instead.
              </p>
              <Link
                to="/events"
                className="inline-flex items-center justify-center rounded-full bg-deep-green px-7 py-3 font-[family-name:var(--font-body)] text-[0.9rem] font-semibold text-white transition-colors hover:bg-terracotta focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
              >
                ← Back to events
              </Link>
            </div>
          </section>
        </>
      );
    }
    return <NotFound />;
  }

  const registrationUrl = isSafeHttpUrl(event.registrationUrl) ? event.registrationUrl : null;
  const detail = event.format;
  // The cover a manager uploaded, full size where there is one and the
  // thumbnail otherwise. It becomes the hero's backdrop rather than an image
  // further down the page.
  const heroImage = event.detailImageUrl ?? event.imageUrl;
  const related = splitEvents(
    mergeEvents(entries, live.posts).filter((candidate) => candidate.slug !== event.slug),
  );
  const relatedEvents = [...related.upcoming, ...related.past].slice(0, 3);

  const registerButton = registrationUrl ? (
    <a
      href={registrationUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-deep-green px-7 py-3.5 font-[family-name:var(--font-body)] text-[0.95rem] font-semibold text-white transition-colors hover:bg-terracotta focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
    >
      Register for this event
      <svg viewBox="0 0 24 24" className="h-4 w-4 stroke-current fill-none stroke-2 stroke-linecap-round stroke-linejoin-round" aria-hidden="true">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  ) : event.origin === 'sheet' ? (
    <a
      href={`mailto:hello@peoplegrowthafrica.com?subject=${encodeURIComponent(`Registration: ${event.title}`)}`}
      className="inline-flex w-full items-center justify-center rounded-full bg-deep-green px-7 py-3.5 font-[family-name:var(--font-body)] text-[0.95rem] font-semibold text-white transition-colors hover:bg-terracotta focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
    >
      Register your interest
    </a>
  ) : (
    <button
      type="button"
      onClick={() => setRegistering(event)}
      className="inline-flex w-full items-center justify-center rounded-full bg-deep-green px-7 py-3.5 font-[family-name:var(--font-body)] text-[0.95rem] font-semibold text-white transition-colors hover:bg-terracotta focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
    >
      {event.type === 'mentorship' ? 'Apply for a place' : 'Register free'}
    </button>
  );

  return (
    <>
      <SEO meta={eventMeta(event)} />

      {/* ── Hero ─────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-deep-green pb-[70px] pt-[140px]">
        {/* The cover fills the band behind the title, softened and darkened so
            the white heading stays legible over any photograph: a blurred green
            scrim, then a wash that deepens towards the top and fades into the
            solid green this section meets below. With no cover both layers sit
            on the same green and the hero looks exactly as it always did. */}
        {heroImage && (
          <img
            src={heroImage}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
            loading="eager"
          />
        )}
        <div className="absolute inset-0 bg-deep-green/50 backdrop-blur-sm" />
        <div className="absolute inset-0 bg-gradient-to-b from-deep-green/75 via-deep-green/45 to-deep-green" />
        {!heroImage && (
          <>
            <div className="absolute -right-20 -top-20 h-[320px] w-[320px] rounded-full bg-terracotta/8" />
            <div className="absolute -bottom-16 -left-14 h-[240px] w-[240px] rounded-full bg-brand-green/10" />
          </>
        )}
        <div className="relative z-[1] mx-auto max-w-[820px] px-6 text-center">
          <AnimateOnScroll>
            <Link
              to="/events"
              className="mb-6 inline-flex items-center gap-2 font-[family-name:var(--font-body)] text-sm text-white/70 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-2 focus-visible:ring-offset-deep-green"
            >
              ← Back to events
            </Link>

            <div className="mb-5 flex flex-wrap items-center justify-center gap-3">
              <span className="inline-flex rounded-full bg-brand-green/20 px-3.5 py-1.5 font-[family-name:var(--font-body)] text-[0.78rem] font-semibold uppercase tracking-wider text-mint">
                {event.typeLabel}
              </span>
              {event.isPast && (
                <span className="inline-flex rounded-full bg-white/10 px-3.5 py-1.5 font-[family-name:var(--font-body)] text-[0.78rem] font-semibold uppercase tracking-wider text-white/70">
                  Past event
                </span>
              )}
            </div>

            <h1
              className="mb-5 font-[family-name:var(--font-heading)] font-semibold leading-[1.15] text-white"
              style={{ fontSize: 'clamp(1.9rem, 4.4vw, 3rem)' }}
            >
              {event.title}
            </h1>

            <p className="font-[family-name:var(--font-body)] text-[0.92rem] text-white/70">
              {event.date} &bull; {event.time}
              {detail ? ` • ${detail}` : ''}
            </p>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── Details ──────────────────────────────────── */}
      <section className="bg-white py-14">
        <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-10 px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <AnimateOnScroll>
              <p className="mb-6 font-[family-name:var(--font-body)] text-[1.05rem] leading-relaxed text-charcoal/70">
                {event.subtitle}
              </p>
            </AnimateOnScroll>

            {event.origin === 'sheet' ? (
              <AnimateOnScroll delay={0.05}>
                <SafeContent body={event.description} />
              </AnimateOnScroll>
            ) : event.origin === 'live' ? (
              // A manager writes this body in the same markup the editor
              // previews; the sheet and built-in renderers do not know it.
              <AnimateOnScroll delay={0.05}>
                <PostBody body={event.description} />
              </AnimateOnScroll>
            ) : (
              <AnimateOnScroll delay={0.05}>
                <div className="space-y-4">
                  <p className="font-[family-name:var(--font-body)] text-[1.02rem] leading-[1.8] text-charcoal/70">
                    {event.description}
                  </p>
                  {event.learningOutcomes.length > 0 && (
                    <>
                      <h2 className="pt-4 font-[family-name:var(--font-heading)] text-xl font-semibold text-charcoal">
                        What you will take away
                      </h2>
                      <ul className="list-disc space-y-2 pl-6">
                        {event.learningOutcomes.map((outcome) => (
                          <li key={outcome} className="font-[family-name:var(--font-body)] text-[0.98rem] leading-relaxed text-charcoal/70">
                            {outcome}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {event.detailedAgenda && event.detailedAgenda.length > 0 && (
                    <>
                      <h2 className="pt-4 font-[family-name:var(--font-heading)] text-xl font-semibold text-charcoal">
                        Agenda
                      </h2>
                      <ul className="list-disc space-y-2 pl-6">
                        {event.detailedAgenda.map((item) => (
                          <li key={item} className="font-[family-name:var(--font-body)] text-[0.98rem] leading-relaxed text-charcoal/70">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </AnimateOnScroll>
            )}

            {event.origin === 'sheet' && isSafeHttpUrl(event.registrationUrl) && (
              <p className="mt-6 font-[family-name:var(--font-body)] text-[0.9rem] text-charcoal/50">
                Registration is handled on the organiser's page, which opens in a new tab.
              </p>
            )}
          </div>

          <aside className="h-fit rounded-[20px] border border-charcoal/10 bg-cream/50 p-6">
            <dl className="space-y-4">
              <div>
                <dt className="font-[family-name:var(--font-body)] text-[0.72rem] font-semibold uppercase tracking-wider text-charcoal/45">
                  Date
                </dt>
                <dd className="mt-1 font-[family-name:var(--font-body)] text-[0.95rem] font-medium text-charcoal">
                  {event.date}
                </dd>
              </div>
              <div>
                <dt className="font-[family-name:var(--font-body)] text-[0.72rem] font-semibold uppercase tracking-wider text-charcoal/45">
                  Time
                </dt>
                <dd className="mt-1 font-[family-name:var(--font-body)] text-[0.95rem] font-medium text-charcoal">
                  {event.time}
                </dd>
              </div>
              <div>
                <dt className="font-[family-name:var(--font-body)] text-[0.72rem] font-semibold uppercase tracking-wider text-charcoal/45">
                  {event.origin === 'sheet' ? 'Location / format' : 'Format'}
                </dt>
                <dd className="mt-1 font-[family-name:var(--font-body)] text-[0.95rem] font-medium text-charcoal">
                  {detail || 'To be confirmed'}
                </dd>
              </div>
              {event.speaker.name && event.speaker.title && (
                <div>
                  <dt className="font-[family-name:var(--font-body)] text-[0.72rem] font-semibold uppercase tracking-wider text-charcoal/45">
                    Speaker
                  </dt>
                  <dd className="mt-1 font-[family-name:var(--font-body)] text-[0.95rem] font-medium text-charcoal">
                    {event.speaker.name}
                  </dd>
                </div>
              )}
            </dl>

            <div className="mt-6">{registerButton}</div>
            <div className="mt-3 flex justify-center">
              <EventShareButton slug={event.slug} title={event.title} labelled />
            </div>

            {event.price && (
              <p className="mt-3 text-center font-[family-name:var(--font-body)] text-[0.8rem] text-charcoal/50">
                {event.price}
              </p>
            )}
          </aside>
        </div>
      </section>

      {/* ── More events ──────────────────────────────── */}
      {relatedEvents.length > 0 && (
        <section className="bg-cream/50 py-16">
          <div className="mx-auto max-w-[1200px] px-6">
            <AnimateOnScroll className="mb-10">
              <h2 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-charcoal">
                More events
              </h2>
            </AnimateOnScroll>
            <div className="grid auto-rows-fr grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {relatedEvents.map((candidate) => (
                <AnimateOnScroll key={candidate.id} className="h-full">
                  <EventCard
                    event={candidate}
                    detailHref={candidate.detailHref}
                    isPast={candidate.isPast}
                    registrationUrl={candidate.registrationUrl}
                    onRegister={(ev) => setRegistering(ev)}
                  />
                </AnimateOnScroll>
              ))}
            </div>
          </div>
        </section>
      )}

      <EventRegistrationModal event={registering} onClose={() => setRegistering(null)} />
    </>
  );
}
