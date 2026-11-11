import { useEffect, useRef, useState } from 'react';
import { isFirstPaint } from '../lib/firstPaint';

/**
 * A gentle entrance for content that starts below the fold.
 *
 * This used to be a framer-motion wrapper with its own `useInView` hook per
 * section. The home page mounts twenty of them, so the browser paid for a
 * motion library and twenty observers before it could paint. It is now CSS
 * transitions plus one IntersectionObserver per element that actually needs
 * one; the API is unchanged.
 *
 * Visible content is never hidden. The server renders the finished state, a
 * prerendered page keeps it, and an element that is already on screen at mount
 * is left alone. Only content that starts below the viewport arms the entrance.
 */
interface AnimateOnScrollProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  once?: boolean;
}

const OFFSETS = {
  up: 'translate3d(0, 30px, 0)',
  down: 'translate3d(0, -30px, 0)',
  left: 'translate3d(-30px, 0, 0)',
  right: 'translate3d(30px, 0, 0)',
} as const;

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

export default function AnimateOnScroll({
  children,
  className = '',
  delay = 0,
  direction = 'up',
  once = true,
}: AnimateOnScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(true);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (isFirstPaint()) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;

    // Already on screen: keep it visible rather than fading in over content the
    // visitor is looking at.
    if (element.getBoundingClientRect().top < window.innerHeight) return;

    setArmed(true);
    setShown(false);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShown(true);
        if (once) observer.disconnect();
      },
      { rootMargin: '0px 0px -40px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [once]);

  const hidden = armed && !shown;

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: hidden ? 0 : 1,
        transform: hidden ? OFFSETS[direction] : 'none',
        transition: armed
          ? `opacity 600ms ${EASE} ${delay}s, transform 600ms ${EASE} ${delay}s`
          : undefined,
        willChange: hidden ? 'opacity, transform' : undefined,
      }}
    >
      {children}
    </div>
  );
}
