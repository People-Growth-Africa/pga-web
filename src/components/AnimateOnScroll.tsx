import { useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { isFirstPaint } from '../lib/firstPaint';

interface AnimateOnScrollProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  once?: boolean;
}

const directionOffset = {
  up: { y: 30, x: 0 },
  down: { y: -30, x: 0 },
  left: { y: 0, x: -30 },
  right: { y: 0, x: 30 },
};

export default function AnimateOnScroll({
  children,
  className = '',
  delay = 0,
  direction = 'up',
  once = true,
}: AnimateOnScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once, margin: '-50px' });
  const offset = directionOffset[direction];
  // Prerendered HTML is already readable; hiding it behind an entrance animation
  // until hydration finishes would undo the point of shipping it. Captured once,
  // in state, so the element cannot be re-hidden later: an animated opacity of 0
  // for anything still below the fold would put the text back out of sight the
  // moment the first hydration finished. Later mounts (client-side navigation)
  // animate normally.
  const [skipEntrance] = useState(isFirstPaint);

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={skipEntrance ? false : { opacity: 0, ...offset }}
      animate={skipEntrance || isInView ? { opacity: 1, y: 0, x: 0 } : { opacity: 0, ...offset }}
      transition={{
        duration: 0.6,
        delay,
        ease: [0.4, 0, 0.2, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
