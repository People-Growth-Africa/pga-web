import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import SEO from '../components/SEO';

export default function NotFound() {
  return (
    <>
      <SEO 
        title="Page Not Found | People Growth Africa" 
        description="The page you're looking for doesn't exist or has been moved." 
      />
      <section className="relative min-h-screen overflow-hidden bg-cream">
        {/* Decorative background elements */}
        <div className="absolute right-[-80px] top-[-80px] h-[300px] w-[300px] rounded-full bg-mint/50" />
        <div className="absolute bottom-[-60px] left-[-60px] h-[200px] w-[200px] rounded-full bg-brand-green/10" />
        <div className="absolute left-[15%] top-[20%] h-[150px] w-[150px] rounded-full bg-terracotta/10" />
        <div className="absolute bottom-[25%] right-[10%] h-[120px] w-[120px] rounded-full bg-deep-green/5" />

        {/* Content */}
        <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-2xl text-center"
          >
            {/* Logo/Brand */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="mb-8"
            >
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-mint text-deep-green shadow-lg">
                <svg 
                  className="h-10 w-10" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
                  />
                </svg>
              </div>
            </motion.div>

            {/* Error badge */}
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mb-4 font-[family-name:var(--font-body)] text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-brand-green"
            >
              Error 404
            </motion.p>

            {/* Main heading */}
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mb-4 font-[family-name:var(--font-heading)] text-5xl font-bold leading-tight text-charcoal sm:text-6xl md:text-7xl"
            >
              Page Not Found
            </motion.h1>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mx-auto mb-10 max-w-[500px] font-[family-name:var(--font-body)] text-base leading-relaxed text-charcoal/70 sm:text-lg"
            >
              We can't seem to find the page you're looking for. It may have been moved, deleted, or never existed.
            </motion.p>

            {/* Action buttons */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="flex flex-col justify-center gap-4 sm:flex-row"
            >
              <Link
                to="/"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-deep-green px-8 py-3.5 font-[family-name:var(--font-body)] font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-brand-green hover:shadow-lg"
              >
                <svg 
                  className="h-5 w-5 transition-transform group-hover:-translate-x-1" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Home
              </Link>
              <Link
                to="/events"
                className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-deep-green bg-transparent px-8 py-3.5 font-[family-name:var(--font-body)] font-semibold text-deep-green transition-all duration-300 hover:bg-deep-green hover:text-white"
              >
                Explore Events
              </Link>
              <Link
                to="/blog"
                className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-charcoal/20 bg-transparent px-8 py-3.5 font-[family-name:var(--font-body)] font-semibold text-charcoal transition-all duration-300 hover:border-charcoal/40 hover:bg-charcoal/5"
              >
                Browse Blog
              </Link>
            </motion.div>

            {/* Help text */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="mt-10 font-[family-name:var(--font-body)] text-sm text-charcoal/50"
            >
              Need help? <Link to="/consultation" className="font-semibold text-deep-green underline decoration-brand-green/40 underline-offset-2 hover:decoration-brand-green">Contact us</Link> for support.
            </motion.p>
          </motion.div>
        </div>
      </section>
    </>
  );
}
