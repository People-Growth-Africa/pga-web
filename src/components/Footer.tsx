import { Link } from 'react-router-dom';
import HoverPill from './HoverPill';

const currentYear = new Date().getFullYear();

/** The organisation's name, spelled exactly as it is in the page titles, Open
 *  Graph tags and the Organization schema. */
const ORG_NAME = 'People Growth Africa';

const socialLinks = [
  {
    name: 'LinkedIn',
    href: 'https://www.linkedin.com/company/people-growth-africa/',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
        <rect x="2" y="9" width="4" height="12" />
        <circle cx="4" cy="4" r="2" />
      </svg>
    ),
  },
  {
    name: 'Instagram',
    href: 'https://www.instagram.com/peoplegrowthafrica',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
      </svg>
    ),
  },
  {
    name: 'YouTube',
    href: 'https://www.youtube.com/@peoplegrowthafrica',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
  {
    name: 'TikTok',
    href: 'https://tiktok.com/@peoplegrowthafrica',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.88 2.89 2.89 0 0 1-2.88-2.88 2.89 2.89 0 0 1 2.88-2.88c.37 0 .72.07 1.05.2V9.45a6.37 6.37 0 0 0-1.05-.09A6.34 6.34 0 0 0 3 15.7a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V9.05a8.27 8.27 0 0 0 4.91 1.6V7.2a4.85 4.85 0 0 1-1-.51z" />
      </svg>
    ),
  },
  {
    name: 'Facebook',
    href: 'https://www.facebook.com/share/1EX85E4hH1/?mibextid=wwXifr',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
];

export default function Footer() {
  const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>, to: string) => {
    if (to.startsWith('/#')) {
      const id = to.slice(2);
      const el = document.getElementById(id);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <footer className="bg-charcoal pt-16 pb-8 text-white/70">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr] gap-12 mb-12">
          <div>
            <Link to="/" className="inline-block mb-4">
              <img
                src="/images/logo-white.png"
                alt="People Growth Africa"
                className="h-16 md:h-20 w-auto object-contain"
              />
            </Link>
            <p className="font-[family-name:var(--font-heading)] text-lg font-medium text-white mb-3">
              People first. Growth always.
            </p>
            <p className="text-sm leading-relaxed max-w-[300px]">
              The partner that growing businesses call when they have outgrown informal people management. Based in Apapa, Lagos, serving businesses across Nigeria and Africa.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white mb-5 font-[family-name:var(--font-body)]">Services</h3>
            <ul className="flex flex-col gap-3">
              <li><a href="/#services" onClick={(e) => handleAnchorClick(e, '/#services')} className="text-[0.9rem] text-white/60 hover:text-brand-green transition-colors">HR Strategy</a></li>
              <li><a href="/#services" onClick={(e) => handleAnchorClick(e, '/#services')} className="text-[0.9rem] text-white/60 hover:text-brand-green transition-colors">Organisational Design</a></li>
              <li><a href="/#services" onClick={(e) => handleAnchorClick(e, '/#services')} className="text-[0.9rem] text-white/60 hover:text-brand-green transition-colors">Talent Management</a></li>
              <li><a href="/#services" onClick={(e) => handleAnchorClick(e, '/#services')} className="text-[0.9rem] text-white/60 hover:text-brand-green transition-colors">Compliance &amp; Policy</a></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white mb-5 font-[family-name:var(--font-body)]">Programmes &amp; Insights</h3>
            <ul className="flex flex-col gap-3">
              <li><Link to="/events" className="text-[0.9rem] text-white/60 hover:text-brand-green transition-colors">Events &amp; Webinars</Link></li>
              <li><Link to="/events" className="text-[0.9rem] text-white/60 hover:text-brand-green transition-colors">Mentorship Cohorts</Link></li>
              <li><Link to="/blog" className="text-[0.9rem] text-white/60 hover:text-brand-green transition-colors">Knowledge Base / Blog</Link></li>
              <li><a href="/#about" onClick={(e) => handleAnchorClick(e, '/#about')} className="text-[0.9rem] text-white/60 hover:text-brand-green transition-colors">About PGA</a></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white mb-5 font-[family-name:var(--font-body)]">Contact &amp; Hours</h3>
            <ul className="flex flex-col gap-3">
              <li><Link to="/consultation" className="text-[0.9rem] text-white/60 hover:text-brand-green transition-colors">Book a free consultation</Link></li>
              <li>
                <a href="mailto:hello@peoplegrowthafrica.com" className="text-[0.9rem] text-white/60 hover:text-brand-green transition-colors">
                  hello@peoplegrowthafrica.com
                </a>
              </li>
              <li>
                <a href="tel:+2349167114560" className="text-[0.9rem] text-white/60 hover:text-brand-green transition-colors">
                  +234 916 711 4560
                </a>
              </li>
              <li>
                <span className="text-[0.85rem] text-white/50 block">
                  Mon &ndash; Fri: 8:00 AM &ndash; 6:00 PM WAT
                </span>
                <span className="text-[0.85rem] text-white/50 block">
                  Sat: 11:00 AM &ndash; 4:00 PM WAT
                </span>
              </li>
              <li>
                <span className="text-[0.9rem] text-white/60">Lagos, Nigeria</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/40">&copy; {currentYear} People Growth Africa. All rights reserved.</p>
          <div className="flex flex-wrap gap-2.5">
            {socialLinks.map((social) => (
              <a
                key={social.name}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer me"
                aria-label={`${ORG_NAME} on ${social.name}`}
                className="group relative w-9 h-9 rounded-full bg-white/8 flex items-center justify-center hover:bg-brand-green transition-all hover:-translate-y-0.5"
              >
                {social.icon}
                {/* Opens upwards: these sit at the foot of the page, so a pill
                    below them would fall outside the viewport. */}
                <HoverPill label={social.name} placement="top" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
