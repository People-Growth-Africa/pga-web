import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

import AnimateOnScroll from '../components/AnimateOnScroll';
import SEO from '../components/SEO';
import { staticPageMeta } from '../lib/pageMeta';
import EventsCarousel from '../components/EventsCarousel';
import EventRegistrationModal from '../components/EventRegistrationModal';
import ServiceDetailModal from '../components/ServiceDetailModal';
import { eventsList, type EventItem } from '../data/events';
import { servicesData, type ServiceDetail } from '../data/services';
import { useConsultation } from '../hooks/useConsultation';

/* ── Data ────────────────────────────────────────────────────────── */

const stats = [
  { number: '10–100', label: 'Employees at the businesses we serve' },
  { number: '5+', label: 'Specialised HR service areas' },
  { number: '2025', label: 'Founded' },
  { number: 'Nigeria', label: 'Where we work' },
];

const vmCards = [
  {
    title: 'Vision',
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round">
        <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
      </svg>
    ),
    text: 'A Pan-African economy where every business, regardless of size, has access to world-class people practices, and where the growth of a business and the growth of its people are inseparable.',
  },
  {
    title: 'Mission',
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    text: 'To help organisations across Africa build the people, systems and cultures that turn everyday work into meaningful growth for employees and businesses alike.',
  },
  {
    /* The third card used to be "Target"; it now carries the word "Purpose".
       Kept here for reference:
    title: 'Target',
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    text: 'Growing businesses across Nigeria and Africa, agribusinesses, SMEs and startups with 10 to 100 employees, ready to move from informal management to proper people practices.',
    */
    title: 'Purpose',
    // A compass: the mark for a direction you keep pointing at, which is what
    // "purpose" means here rather than the people glyph the Target card used.
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round">
        <circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
      </svg>
    ),
    text: 'To restore the dignity of work by making people, not just processes, the foundation of every organisation we touch.',
  },
];

/* The fifteen-area list this page used to render. Kept for reference only:
it is not read anywhere while the five boxes below are the ones on screen.

const specialties = [
  { name: 'HR Advisory & Consulting', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg> },
  { name: 'Learning & Development', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg> },
  { name: 'Organisational Design', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg> },
  { name: 'Culture Development', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg> },
  { name: 'Performance Management', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg> },
  { name: 'HR Audits & Compliance', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg> },
  { name: 'Agribusiness Workforce Development', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg> },
  { name: 'Career Development Programmes', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg> },
  { name: 'Recruitment & Talent Management', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg> },
  { name: 'HR Retainerships', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg> },
  { name: 'People Strategy for SMEs', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg> },
  { name: 'Workforce Formalisation', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg> },
  { name: 'Nigerian Labour Law Compliance', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg> },
  { name: 'Team Effectiveness', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg> },
  { name: 'Leadership Development', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg> },
];
*/

/* The five practice areas the home page shows. `serviceId` points at the
   detail record in servicesData that "View Details" opens, so the label shown
   here can read differently from the record's own name. */
const specialties = [
  { serviceId: 'hr-advisory', name: 'HR Advisory & Consulting', icon: <svg viewBox="0 0 24 24" className="w-6 h-6 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg> },
  { serviceId: 'learning-development', name: 'Learning & Development', icon: <svg viewBox="0 0 24 24" className="w-6 h-6 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg> },
  { serviceId: 'organisational-design', name: 'Organisational Design & Culture', icon: <svg viewBox="0 0 24 24" className="w-6 h-6 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg> },
  { serviceId: 'performance-management', name: 'Performance Management Systems', icon: <svg viewBox="0 0 24 24" className="w-6 h-6 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg> },
  { serviceId: 'agribusiness-people-strategy', name: 'Agribusiness People Strategy', icon: <svg viewBox="0 0 24 24" className="w-6 h-6 stroke-brand-green fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"><path d="M12 22V10" /><path d="M12 10C12 6 9 3 5 3c0 4 3 7 7 7z" /><path d="M12 13c0-4 3-7 7-7 0 4-3 7-7 7z" /></svg> },
];

const values = [
  { num: '01', title: 'Transparency', text: "We believe honest conversations build the strongest organisations. No hidden agendas, no jargon, just clear guidance you can act on." },
  { num: '02', title: 'Excellence', text: "Good enough isn't. We bring rigorous, evidence-based practices adapted to the African business context, not imported templates that don't fit." },
  { num: '03', title: 'Partnership', text: "We don't just deliver a report and leave. We walk alongside you, building internal capability so your people systems grow with your business." },
  { num: '04', title: 'Local Expertise', text: "Africa isn't a monolith. We bring deep understanding of the regulatory, cultural, and operational realities across the continent's diverse markets." },
];

const faqs = [
  { q: 'What does People Growth Africa do?', a: 'We are an HR and organisational consulting firm based in Apapa, Lagos, helping businesses across Nigeria and Africa build structured, effective people systems. From recruitment and performance management to organisational design, culture development, and Nigerian labour law compliance, we provide practical solutions tailored to the realities of operating on the continent.' },
  { q: 'Who do you work with?', a: 'We work with growth-stage businesses across Nigeria and Africa, agribusinesses, SMEs, and startups, typically 10 to 100 employees. These are companies that have outgrown informal people management but do not yet have the systems to match their ambition.' },
  { q: 'How does an engagement start?', a: "It starts with a free 30-minute consultation where we learn about your business, your team, and the people challenges you're facing. From there, we propose a tailored engagement, whether that's a focused diagnostic, a full HR transformation project, or ongoing advisory support." },
  { q: 'What industries do you serve?', a: 'We work across a wide range of industries including agribusiness, financial services, technology, logistics, education, healthcare, manufacturing, and professional services. Our approach is always adapted to the specific regulatory environment and workforce dynamics of your sector.' },
  { q: 'What makes you different from a generic HR consultant?', a: "Three things. First, we are exclusively focused on African businesses. Second, we don't just advise; we implement alongside you, training your managers and building internal capability. Third, we are here for the long term, staying until the growth takes root." },
  { q: 'Do you handle Nigerian labour law compliance and HR audits?', a: 'Yes. HR Audits & Compliance and Nigerian Labour Law Compliance are two of our core specialities. We help businesses audit their current people practices against Nigerian regulations, identify gaps, and build compliant systems.' },
];

/* ── Page ────────────────────────────────────────────────────────── */

export default function Home() {
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [showAllFaqs, setShowAllFaqs] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [selectedServiceDetail, setSelectedServiceDetail] = useState<ServiceDetail | null>(null);
  const { openConsultation } = useConsultation();
  const VISIBLE_FAQS = 3;

  // Scroll-triggered fade-in for legacy elements
  useEffect(() => {
    const ids = ['services', 'about', 'events', 'testimonials', 'contact'];
    const handleAnchor = () => {
      const hash = window.location.hash.slice(1);
      if (ids.includes(hash)) {
        setTimeout(() => {
          document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    };
    handleAnchor();
    window.addEventListener('hashchange', handleAnchor);
    return () => window.removeEventListener('hashchange', handleAnchor);
  }, []);

  return (
    <>
      <SEO meta={staticPageMeta('/')} />

      {/* ── Hero ─────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center bg-deep-green overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=1920&q=80&auto=format"
            alt="African professionals in a boardroom meeting discussing strategy"
            className="w-full h-full object-cover opacity-35"
            loading="eager"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-br from-deep-green/92 via-deep-green/75 to-brand-green/60 z-[1]" />
        <div className="relative z-[2] max-w-[1200px] mx-auto px-6 pt-[150px] pb-[100px]">
          <AnimateOnScroll delay={0.1}>
            <h1
              className="font-[family-name:var(--font-heading)] font-semibold text-white leading-[1.1] mb-6 max-w-[780px]"
              style={{ fontSize: 'clamp(2.8rem, 6vw, 4.8rem)' }}
            >
              Build the People Systems<br />Behind <span className="text-mint">Every Growing Business.</span>
            </h1>
          </AnimateOnScroll>

          {/* The lead-in line below is hidden for now; the heading and the
              buttons carry the hero on their own.
          <AnimateOnScroll delay={0.2}>
            <p
              className="font-[family-name:var(--font-body)] text-white/80 max-w-[560px] leading-relaxed mb-10"
              style={{ fontSize: 'clamp(1rem, 1.8vw, 1.2rem)' }}
            >
              You have outgrown informal people management. We build the HR systems that let your business and your people grow together.
            </p>
          </AnimateOnScroll>
          */}

          <AnimateOnScroll delay={0.3}>
            <div className="flex flex-wrap gap-4">
              <button
                type="button"
                onClick={() => openConsultation()}
                className="inline-flex items-center gap-2 px-9 py-4 bg-brand-green text-white font-[family-name:var(--font-body)] font-semibold rounded-full hover:bg-terracotta transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(196,119,59,0.3)] cursor-pointer"
              >
                Book a free consultation →
              </button>
              <Link
                to="/events"
                className="inline-flex items-center gap-2 px-9 py-4 bg-transparent text-white font-[family-name:var(--font-body)] font-semibold rounded-full border-2 border-white/30 hover:border-white hover:bg-white/10 transition-all duration-300"
              >
                Explore webinars &amp; mentorships
              </Link>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── Stats ─────────────────────────────────────── */}
      <section className="relative bg-mint py-16">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-8 text-center">
            {stats.map((s, i) => (
              <AnimateOnScroll key={i} delay={i * 0.1} className="relative">
                <div
                  className="font-[family-name:var(--font-heading)] font-bold text-deep-green leading-none mb-2"
                  style={{ fontSize: 'clamp(2.2rem, 4vw, 3.2rem)' }}
                >
                  {s.number.includes('+') ? (
                    <>{s.number.replace('+', '')}<span className="text-terracotta">+</span></>
                  ) : s.number}
                </div>
                <div className="font-[family-name:var(--font-body)] text-sm font-medium text-charcoal/60 max-w-[180px] mx-auto leading-relaxed">
                  {s.label}
                </div>
                {i < stats.length - 1 && (
                  <div className="hidden md:block absolute right-0 top-[10%] h-[80%] w-px bg-deep-green/15" />
                )}
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ── Vision / Mission / Target ─────────────────── */}
      <section className="relative py-[100px] overflow-hidden" id="about">
        <div className="max-w-[1200px] mx-auto px-6">
          <AnimateOnScroll className="text-center mb-[60px]">
            <p className="font-[family-name:var(--font-body)] text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-brand-green mb-3">Who We Are</p>
            <h2
              className="font-[family-name:var(--font-heading)] font-semibold text-charcoal leading-[1.15] mb-4"
              style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}
            >
              Purpose-Driven. People-Focused.<br />Built for Africa.
            </h2>
            {/* The original line said "a defined target"; the third card is now
                Purpose, so the wording follows it.
            <p className="font-[family-name:var(--font-body)] text-[1.05rem] text-charcoal/65 max-w-[600px] mx-auto leading-relaxed">
              We are here for the long term, staying until the growth takes root. Everything we do is anchored in a clear vision, a bold mission, and a defined target.
            </p>
            */}
            <p className="font-[family-name:var(--font-body)] text-[1.05rem] text-charcoal/65 max-w-[600px] mx-auto leading-relaxed">
              We are here for the long term, staying until the growth takes root. Everything we do is anchored in a clear vision, a bold mission, and a defined purpose.
            </p>
          </AnimateOnScroll>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
            {vmCards.map((card, i) => (
              /* h-full on the wrapper and the card lets the grid stretch all
                 three to the tallest one, so no card ends short of its
                 neighbours. The cards keep their lift-less hover: the text is
                 the only thing that changes between them. */
              <AnimateOnScroll key={i} delay={i * 0.1} className="h-full">
                <div className="h-full flex flex-col bg-white rounded-[20px] p-11 shadow-card border border-charcoal/5">
                  <div className="w-14 h-14 rounded-full bg-mint flex items-center justify-center mb-6">{card.icon}</div>
                  <h3 className="font-[family-name:var(--font-heading)] text-[1.4rem] font-semibold text-charcoal mb-3.5">{card.title}</h3>
                  <p className="font-[family-name:var(--font-body)] text-[0.95rem] text-charcoal/65 leading-relaxed">{card.text}</p>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ── Services / Specialties ─────────────────────── */}
      <section className="relative py-[100px] bg-mint overflow-hidden" id="services">
        <div className="max-w-[1200px] mx-auto px-6">
          <AnimateOnScroll className="text-center mb-12">
            <p className="font-[family-name:var(--font-body)] text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-brand-green mb-3">What We Do</p>
            <h2
              className="font-[family-name:var(--font-heading)] font-semibold text-charcoal leading-[1.15] mb-4"
              style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}
            >
              5 Specialised HR<br />Service Areas
            </h2>
            <p className="font-[family-name:var(--font-body)] text-[1.05rem] text-charcoal/65 max-w-[600px] mx-auto leading-relaxed">
              Pick a service to see what you get, how long it usually takes and the businesses it suits.
            </p>
          </AnimateOnScroll>

          {/* Six columns at laptop width with each card two wide: three across
              the first row, then the last two centred underneath. Phones and
              tablets keep the old two and three column flow. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 lg:gap-5">
            {specialties.map((sp, i) => {
              const detail = servicesData.find((s) => s.id === sp.serviceId);
              return (
                <AnimateOnScroll
                  key={i}
                  delay={Math.min(i * 0.04, 0.4)}
                  className={`lg:col-span-2 ${i === 3 ? 'lg:col-start-2' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => detail && setSelectedServiceDetail(detail)}
                    className="w-full h-full bg-white rounded-[16px] p-6 text-center shadow-card hover:-translate-y-[4px] hover:shadow-card-hover transition-all duration-300 border border-charcoal/5 cursor-pointer group flex flex-col items-center justify-between min-h-[180px]"
                  >
                    <div className="w-12 h-12 rounded-full bg-mint group-hover:bg-brand-green/20 flex items-center justify-center mx-auto mb-3.5 transition-colors">
                      {sp.icon}
                    </div>
                    <h4 className="font-[family-name:var(--font-body)] text-[0.95rem] font-semibold text-charcoal leading-snug group-hover:text-deep-green transition-colors">
                      {sp.name}
                    </h4>
                    <span className="text-[0.75rem] text-brand-green font-semibold mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      View Details →
                    </span>
                  </button>
                </AnimateOnScroll>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Upcoming Events & Mentorship Sessions (Carousel) ── */}
      <section className="relative py-[100px] bg-white overflow-hidden" id="events">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-6">
            <AnimateOnScroll>
              <p className="font-[family-name:var(--font-body)] text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-brand-green mb-3">
                Events &amp; Programmes
              </p>
              <h2
                className="font-[family-name:var(--font-heading)] font-semibold text-charcoal leading-[1.15]"
                style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}
              >
                Upcoming Webinars &amp;<br />Mentorship Cohorts
              </h2>
            </AnimateOnScroll>

            <AnimateOnScroll delay={0.1}>
              <Link
                to="/events"
                className="inline-flex items-center gap-2 px-6 py-3 bg-cream text-charcoal font-[family-name:var(--font-body)] text-xs md:text-sm font-semibold rounded-full hover:bg-deep-green hover:text-white transition-all duration-300 border border-charcoal/10"
              >
                View Full Events Schedule →
              </Link>
            </AnimateOnScroll>
          </div>

          {/* Interactive Card Carousel */}
          <AnimateOnScroll delay={0.15}>
            <EventsCarousel
              events={eventsList}
              onRegister={(ev) => setSelectedEvent(ev)}
            />
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── Values ─────────────────────────────────────── */}
      <section className="relative py-[100px] bg-cream/60 overflow-hidden">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-start">
            <AnimateOnScroll className="md:sticky md:top-[120px]">
              <p className="font-[family-name:var(--font-body)] text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-brand-green mb-3">Our Values</p>
              <h2
                className="font-[family-name:var(--font-heading)] font-semibold text-charcoal leading-[1.15] mb-4"
                style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}
              >
                What Guides<br />Every Decision
              </h2>
              <p className="font-[family-name:var(--font-body)] text-[1.05rem] text-charcoal/65 leading-relaxed">
                These aren&apos;t words on a wall. They&apos;re the principles that shape every recommendation, every workshop, and every conversation we have with our clients.
              </p>
            </AnimateOnScroll>

            <div className="flex flex-col gap-4">
              {values.map((v, i) => (
                <AnimateOnScroll key={i} delay={i * 0.08} direction="right">
                  <div className="flex items-start gap-5 bg-white rounded-[14px] p-7 shadow-card hover:translate-x-1 hover:shadow-card-hover transition-all duration-300 border border-charcoal/5">
                    <span className="font-[family-name:var(--font-heading)] text-[1.5rem] font-bold text-terracotta leading-none min-w-[36px] pt-0.5">{v.num}</span>
                    <div>
                      <h4 className="font-[family-name:var(--font-heading)] text-[1.15rem] font-semibold text-charcoal mb-1.5">{v.title}</h4>
                      <p className="font-[family-name:var(--font-body)] text-[0.9rem] text-charcoal/60 leading-relaxed">{v.text}</p>
                    </div>
                  </div>
                </AnimateOnScroll>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonials ───────────────────────────────── */}
      <section className="relative py-[100px] bg-white overflow-hidden" id="testimonials">
        <div className="max-w-[1200px] mx-auto px-6">
          <AnimateOnScroll className="text-center mb-12">
            <p className="font-[family-name:var(--font-body)] text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-brand-green mb-3">Client Stories</p>
            <h2
              className="font-[family-name:var(--font-heading)] font-semibold text-charcoal leading-[1.15] mb-4"
              style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}
            >
              Trusted by Growing<br />African Businesses
            </h2>
            <p className="font-[family-name:var(--font-body)] text-[1.05rem] text-charcoal/65 max-w-[600px] mx-auto leading-relaxed">
              Hear from the leaders who&apos;ve transformed their people practices with our support.
            </p>
          </AnimateOnScroll>

          {/* A real client story sits to the left of the invitation box; the
              two stack on phones and sit side by side from lg up. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-7 items-stretch">
            <AnimateOnScroll>
              <figure className="h-full bg-white rounded-[24px] p-8 md:p-10 border border-charcoal/10 shadow-card flex flex-col text-left">
                <div className="w-12 h-12 rounded-full bg-mint text-deep-green flex items-center justify-center mb-5 border border-brand-green/30">
                  <svg className="w-6 h-6 stroke-current fill-none stroke-2 stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
                    <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2H4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2 0 4-1.5 6-3 6" />
                    <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2h-4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2 0 4-1.5 6-3 6" />
                  </svg>
                </div>
                <blockquote className="flex-1 flex flex-col gap-4">
                  <p className="font-[family-name:var(--font-body)] text-[0.95rem] md:text-base text-charcoal/70 leading-relaxed">
                    It has been a pleasure working with PGA. Your support has helped Herdbase Africa become more intentional about building the right people, structures, and culture alongside our growth.
                  </p>
                  <p className="font-[family-name:var(--font-body)] text-[0.95rem] md:text-base text-charcoal/70 leading-relaxed">
                    I particularly appreciate your practical approach and willingness to understand our unique needs as a growing company. I would gladly recommend PGA to any organisation looking to build stronger people systems and a high-performing team.
                  </p>
                  <p className="font-[family-name:var(--font-body)] text-[0.95rem] md:text-base text-charcoal/70 leading-relaxed">
                    Thank you for being part of our journey.
                  </p>
                </blockquote>
                <figcaption className="mt-7 pt-6 border-t border-charcoal/10 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-deep-green text-mint flex items-center justify-center font-[family-name:var(--font-heading)] font-semibold text-sm shrink-0">
                    MIS
                  </div>
                  <div>
                    <div className="font-[family-name:var(--font-body)] font-semibold text-[0.95rem] text-charcoal">
                      Mustapha Idris Suleiman
                    </div>
                    <div className="font-[family-name:var(--font-body)] text-[0.85rem] text-charcoal/55">
                      Founder, Herdbase Africa
                    </div>
                  </div>
                </figcaption>
              </figure>
            </AnimateOnScroll>

            {/* Premium quote box (invitation) */}
            <AnimateOnScroll delay={0.1}>
              <div className="h-full text-center py-16 px-8 max-w-xl mx-auto w-full bg-cream/30 rounded-[24px] border border-charcoal/10 flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-mint text-deep-green flex items-center justify-center mx-auto mb-4 border border-brand-green/30">
                  <svg className="w-6 h-6 stroke-current fill-none stroke-2 stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
                    <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2H4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2 0 4-1.5 6-3 6" />
                    <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2h-4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2 0 4-1.5 6-3 6" />
                  </svg>
                </div>
                <p
                  className="font-[family-name:var(--font-heading)] font-semibold text-charcoal mb-3"
                  style={{ fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)' }}
                >
                  Be our next success story
                </p>
                <p className="font-[family-name:var(--font-body)] text-sm md:text-base text-charcoal/60 leading-relaxed mb-6">
                  Work with us, and let your growth story become the next one we tell.
                </p>
                <button
                  type="button"
                  onClick={() => openConsultation()}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-deep-green text-white text-xs font-semibold rounded-full hover:bg-brand-green transition-all cursor-pointer"
                >
                  Talk to an advisor
                </button>
              </div>
            </AnimateOnScroll>
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────── */}
      <section className="relative py-[100px] bg-mint overflow-hidden" id="faqs">
        <div className="max-w-[1200px] mx-auto px-6">
          <AnimateOnScroll className="text-center mb-12">
            <p className="font-[family-name:var(--font-body)] text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-brand-green mb-3">Your Questions, Answered</p>
            <h2
              className="font-[family-name:var(--font-heading)] font-semibold text-charcoal leading-[1.15] mb-4"
              style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}
            >
              Frequently Asked Questions
            </h2>
            <p className="font-[family-name:var(--font-body)] text-[1.05rem] text-charcoal/65 max-w-[600px] mx-auto leading-relaxed">
              Everything you need to know about working with People Growth Africa.
            </p>
          </AnimateOnScroll>

          <div className="max-w-[800px] mx-auto flex flex-col gap-3">
            {faqs.slice(0, showAllFaqs ? faqs.length : VISIBLE_FAQS).map((faq, i) => (
              <AnimateOnScroll key={i} delay={i * 0.05}>
                <div className={`bg-white rounded-[14px] overflow-hidden transition-shadow duration-300 ${faqOpen === i ? 'shadow-card-hover' : 'shadow-card'}`}>
                  <button
                    className="flex items-center justify-between w-full px-7 py-[22px] bg-transparent border-none cursor-pointer text-left font-[family-name:var(--font-body)] text-base font-semibold text-charcoal gap-4 hover:text-deep-green transition-colors"
                    onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                    aria-expanded={faqOpen === i}
                  >
                    {faq.q}
                    <span className={`w-8 h-8 min-w-8 rounded-full flex items-center justify-center transition-all duration-300 ${faqOpen === i ? 'bg-brand-green rotate-45' : 'bg-mint'}`}>
                      <svg viewBox="0 0 24 24" className={`w-4 h-4 fill-none stroke-2.5 stroke-linecap-round ${faqOpen === i ? 'stroke-white' : 'stroke-brand-green'}`}>
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </span>
                  </button>
                  <div className={`overflow-hidden transition-all duration-400 ${faqOpen === i ? 'max-h-[400px]' : 'max-h-0'}`}>
                    <p className="px-7 pb-6 font-[family-name:var(--font-body)] text-[0.95rem] text-charcoal/65 leading-relaxed">{faq.a}</p>
                  </div>
                </div>
              </AnimateOnScroll>
            ))}
            {faqs.length > VISIBLE_FAQS && (
              <AnimateOnScroll delay={VISIBLE_FAQS * 0.05}>
                <button
                  onClick={() => setShowAllFaqs(!showAllFaqs)}
                  className="mx-auto w-fit flex items-center gap-2 mt-4 px-6 py-3 bg-transparent border-2 border-deep-green/20 text-deep-green font-[family-name:var(--font-body)] text-[0.9rem] font-semibold rounded-full cursor-pointer hover:border-deep-green hover:bg-deep-green hover:text-white transition-all duration-300"
                >
                  {showAllFaqs ? 'Show fewer questions' : `More questions (${faqs.length - VISIBLE_FAQS})`}
                  <svg viewBox="0 0 24 24" className={`w-4 h-4 fill-none stroke-2 stroke-linecap-round transition-transform duration-300 ${showAllFaqs ? 'rotate-180' : ''}`}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              </AnimateOnScroll>
            )}
          </div>
        </div>
      </section>

      {/* ── Executive Strategic Partnership CTA (Modal Trigger) ─ */}
      <section className="relative bg-deep-green py-[110px] text-white text-center overflow-hidden" id="contact">
        <div className="absolute top-[-80px] right-[-80px] w-96 h-96 rounded-full bg-brand-green/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-80px] left-[-80px] w-80 h-80 rounded-full bg-terracotta/20 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-[1200px] mx-auto px-6">
          <AnimateOnScroll>
            <span className="inline-block px-4 py-1.5 rounded-full bg-white/10 text-mint text-xs font-semibold uppercase tracking-wider mb-4 backdrop-blur-sm">
              Free 30-minute strategic diagnostic
            </span>
            <h2
              className="font-[family-name:var(--font-heading)] font-semibold text-white leading-[1.15] mb-5 max-w-[760px] mx-auto"
              style={{ fontSize: 'clamp(2.2rem, 4.5vw, 3.4rem)' }}
            >
              Ready to Build the People Engine<br />of Your Growth?
            </h2>
          </AnimateOnScroll>

          <AnimateOnScroll delay={0.1}>            <p
              className="font-[family-name:var(--font-body)] text-white/80 text-base md:text-lg max-w-[620px] mx-auto leading-relaxed mb-8"
            >
              Let&apos;s look at where your people systems stand today and where they need to be. Book a free 30-minute diagnostic, or message an advisor on WhatsApp.
            </p>

            {/* Operating Hours Summary */}
            <div className="inline-flex flex-wrap items-center justify-center gap-4 py-2 px-5 rounded-full bg-white/8 text-xs text-white/90 font-medium mb-10 border border-white/10">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-brand-green" />
                <span>Mon &ndash; Fri: <strong>8:00 AM &ndash; 6:00 PM WAT</strong></span>
              </div>
              <span className="text-white/30 hidden sm:inline">&bull;</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-terracotta" />
                <span>Sat: <strong>11:00 AM &ndash; 4:00 PM WAT</strong></span>
              </div>
            </div>
          </AnimateOnScroll>

          <AnimateOnScroll delay={0.2}>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => openConsultation()}
                className="inline-flex items-center gap-2 px-9 py-4 bg-terracotta text-white font-[family-name:var(--font-body)] text-sm font-semibold rounded-full hover:bg-brand-green transition-all duration-300 hover:-translate-y-0.5 shadow-lg cursor-pointer"
              >
                Book a free consultation →
              </button>
              <Link
                to="/consultation"
                className="inline-flex items-center gap-2 px-8 py-4 bg-white/10 text-white font-[family-name:var(--font-body)] text-sm font-semibold rounded-full border border-white/20 hover:bg-white/20 transition-all duration-300"
              >
                See the full booking form
              </Link>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* Service Detail Modal (Item 3) */}
      <ServiceDetailModal
        service={selectedServiceDetail}
        onClose={() => setSelectedServiceDetail(null)}
        onBookConsultation={(serviceName) => openConsultation(serviceName)}
      />

      {/* Registration Modal for Featured Events */}
      <EventRegistrationModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </>
  );
}
