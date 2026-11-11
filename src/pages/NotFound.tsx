import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import SEO from '../components/SEO';

export default function NotFound() {
  return (
    <>
      <SEO title="Page Not Found | People Growth Africa" description="The page you're looking for doesn't exist or has been moved." />
      <section className="min-h-screen flex items-center justify-center bg-cream relative overflow-hidden">
        <div className="absolute top-[-80px] right-[-80px] w-[300px] h-[300px] rounded-full bg-mint/50" />
        <div className="absolute bottom-[-60px] left-[-60px] w-[200px] h-[200px] rounded-full bg-brand-green/10" />
        <div className="relative z-[1] text-center px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <p className="font-[family-name:var(--font-body)] text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-brand-green mb-4">Error</p>
            <h1 className="font-[family-name:var(--font-heading)] font-bold text-charcoal leading-none mb-4"
              style={{ fontSize: 'clamp(6rem, 15vw, 10rem)' }}>
              404
            </h1>
            <p className="font-[family-name:var(--font-heading)] text-xl font-semibold text-charcoal mb-3">Page Not Found</p>
            <p className="font-[family-name:var(--font-body)] text-base text-charcoal/55 max-w-[400px] mx-auto mb-8 leading-relaxed">
              The page you're looking for doesn't exist or has been moved. Let's get you back on track.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/"
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-deep-green text-white font-[family-name:var(--font-body)] font-semibold rounded-full hover:bg-terracotta transition-all duration-300 hover:-translate-y-0.5"
              >
                ← Back to Home
              </Link>
              <Link
                to="/blog"
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-transparent text-deep-green font-[family-name:var(--font-body)] font-semibold rounded-full border-2 border-deep-green hover:bg-deep-green hover:text-white transition-all duration-300"
              >
                Browse the Blog
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
