import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import precomputedData from '../data/precomputedLogoParts.json';

export interface LogoPart {
  x: number; // 0 to 1 normalized
  y: number; // 0 to 1 normalized
  radius: number; // relative dot radius
}

export interface LogoIntroAnimationProps {
  /** Source URL of flat logo image (PNG/SVG), used in dark mode */
  logoSrc: string;
  /** The same mark for light mode. Omit it and `logoSrc` is used everywhere. */
  lightLogoSrc?: string;
  /** Optional precomputed part sampling list from build time */
  precomputedParts?: LogoPart[];
  /** Optional separate wordmark text to animate in Phase D */
  wordmarkText?: string;
  /** Target density: cell size factor. Lower = denser. */
  density?: number;
  /** Maximum rendering dots cap for Phase A performance (default 55 for 60fps) */
  maxPartsCap?: number;
  /** Callback when intro finishes */
  onComplete?: () => void;
  /** Custom overlay styling */
  className?: string;
  /** Force animation run even if sessionStorage exists */
  forceRun?: boolean;
}

/** Phones get a plain fade and scale instead of the dot scatter. The dots are
 *  SVG children animated from JavaScript, every one of them inside a scaled,
 *  promoted layer, so the frame cost rises with the node count: a phone pays
 *  for every frame it paints. The reveal below is a single <img> with a CSS
 *  transform/opacity animation, which the compositor runs on its own, so the
 *  main thread has nothing left to do after the first frame. */
const MOBILE_MAX_WIDTH = 640;
/** Matches --animate-logo-reveal in src/index.css. */
const MOBILE_REVEAL_MS = 620;
/** Grace on top of the reveal before it is recorded as finished. */
const MOBILE_SETTLE_GRACE_MS = 200;
const FULL_START_SCALE = 3.2;

/**
 * icon-black.png and icon-white.png are trimmed, centred square marks now: the
 * leaf fills 97% of the height and 85% of the width of a 512x512 canvas.
 *
 * Was 1.5. The old 683x512 files carried the leaf at only 40% of their width
 * and 61% of their height, so the frame had to scale the image up and clip the
 * empty margin to stop the mark looking lost in its own file. The files fill
 * their canvas themselves now, so the image is shown at its own size. The
 * factor stays named because it is still the one knob for the mark's scale.
 */
const MARK_FRAME_SCALE = 1;

/** The square a header mark sits in: the leaf reads about 97% of its height. */
export const MARK_FRAME_SIZE = 'h-10 w-10 md:h-12 md:w-12';

/**
 * The brand mark in its square frame, in whichever brand file suits the surface
 * it is on: icon-black.png on a light page, icon-white.png on a dark one. The
 * `dark:` variant follows the operating system preference, the same rule the tab
 * icon uses in index.html.
 *
 * Exported so the account pages carry the identical lockup rather than their own
 * copy of the sizing rules.
 */
export function BrandMark({
  darkSrc,
  lightSrc,
  frameClassName = '',
  frameExtraClassName = '',
}: {
  darkSrc: string;
  lightSrc?: string;
  frameClassName?: string;
  frameExtraClassName?: string;
}) {
  const frame = `items-center justify-center overflow-hidden shrink-0 ${frameClassName} ${frameExtraClassName}`;
  const imgClassName = 'h-full w-auto max-w-none object-contain';
  const style = { transform: `scale(${MARK_FRAME_SCALE})` };

  return (
    <>
      <span className={`${frame} hidden dark:flex`}>
        <img src={darkSrc} alt="People Growth Africa" className={imgClassName} style={style} />
      </span>
      <span className={`${frame} flex dark:hidden`}>
        <img
          src={lightSrc ?? darkSrc}
          alt="People Growth Africa"
          className={imgClassName}
          style={style}
        />
      </span>
    </>
  );
}

/** Grace period after the intro should have finished before it is assumed
 *  stalled and landed on its final frame. */
const STALL_GRACE_MS = 900;

function sampleLogoImage(
  logoUrl: string,
  density: number = 32,
  maxCap: number = 55
): Promise<{ parts: LogoPart[]; aspectRatio: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = logoUrl;
    img.onload = () => {
      const sampleWidth = 320;
      const aspectRatio = img.height / img.width;
      const sampleHeight = Math.round(sampleWidth * aspectRatio);

      const canvas = document.createElement('canvas');
      canvas.width = sampleWidth;
      canvas.height = sampleHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ parts: [], aspectRatio: 1 });
        return;
      }

      ctx.drawImage(img, 0, 0, sampleWidth, sampleHeight);
      const imgData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
      const pixels = imgData.data;

      let minX = sampleWidth,
        maxX = 0,
        minY = sampleHeight,
        maxY = 0;
      let hasPixels = false;

      for (let y = 0; y < sampleHeight; y++) {
        for (let x = 0; x < sampleWidth; x++) {
          const idx = (y * sampleWidth + x) * 4;
          const alpha = pixels[idx + 3];
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];
          const isDark = alpha > 20 && !(r > 245 && g > 245 && b > 245);

          if (isDark) {
            hasPixels = true;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (!hasPixels) {
        minX = 0;
        maxX = sampleWidth;
        minY = 0;
        maxY = sampleHeight;
      }

      const bboxWidth = maxX - minX || sampleWidth;
      const bboxHeight = maxY - minY || sampleHeight;
      const stepG = Math.max(4, Math.floor(bboxWidth / density));
      const parts: LogoPart[] = [];
      const maxDotRadius = (stepG / bboxWidth) * 0.95;

      for (let gy = minY; gy < maxY; gy += stepG) {
        for (let gx = minX; gx < maxX; gx += stepG) {
          let sumCoverage = 0;
          let count = 0;
          let sumX = 0;
          let sumY = 0;

          for (let cy = gy; cy < Math.min(gy + stepG, maxY); cy++) {
            for (let cx = gx; cx < Math.min(gx + stepG, maxX); cx++) {
              const idx = (cy * sampleWidth + cx) * 4;
              const alpha = pixels[idx + 3] / 255;
              const r = pixels[idx];
              const g = pixels[idx + 1];
              const b = pixels[idx + 2];
              const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
              const coverage = alpha > 0.1 ? (alpha < 0.9 ? alpha : 1 - lum * 0.8) : 0;

              if (coverage > 0.05) {
                sumCoverage += coverage;
                sumX += cx;
                sumY += cy;
                count++;
              }
            }
          }

          if (count > 0) {
            const avgCoverage = sumCoverage / (stepG * stepG);
            if (avgCoverage >= 0.08) {
              const centroidX = (sumX / count - minX) / bboxWidth;
              const centroidY = (sumY / count - minY) / bboxHeight;
              const radius = Math.max(0.005, maxDotRadius * Math.sqrt(avgCoverage));
              parts.push({ x: centroidX, y: centroidY, radius });
            }
          }
        }
      }

      let finalParts = parts;
      if (parts.length > maxCap) {
        const stride = parts.length / maxCap;
        finalParts = [];
        for (let i = 0; i < maxCap; i++) {
          finalParts.push(parts[Math.floor(i * stride)]);
        }
      }

      resolve({ parts: finalParts, aspectRatio: bboxHeight / bboxWidth });
    };
    img.onerror = () => resolve({ parts: [], aspectRatio: 1 });
  });
}

export function LogoIntroAnimation({
  logoSrc,
  lightLogoSrc,
  precomputedParts,
  wordmarkText,
  density = 32,
  maxPartsCap = 55,
  onComplete,
  className = '',
  forceRun = false,
}: LogoIntroAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stippleGroupRef = useRef<SVGGElement>(null);
  // The settled logo sits in its own clipped frame now, so this points at the
  // frame rather than at the <img> inside it: the crossfade fades the frame.
  const realLogoRef = useRef<HTMLDivElement>(null);
  const wordmarkRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Only the mark scales during the intro. Scaling the wrapper used to drag the
  // wordmark along with it, which forced the browser to rasterise twelve text
  // nodes at 3.2x on every frame and was the main source of the jank here.
  const markRef = useRef<HTMLDivElement>(null);

  const [shouldAnimate] = useState(() => {
    if (typeof window === 'undefined') return false;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasSeen = sessionStorage.getItem('pga_logo_animated') === 'true';
    return !prefersReducedMotion && (!hasSeen || forceRun);
  });

  // Read once: the intro is a one-shot on mount, so a later rotation should not
  // swap the shape of an animation that has already played.
  const [isNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < MOBILE_MAX_WIDTH,
  );
  const mobileReveal = shouldAnimate && isNarrow;

  const [parts, setParts] = useState<LogoPart[]>(() => {
    if (precomputedParts && precomputedParts.length > 0) return precomputedParts;
    if (precomputedData && Array.isArray(precomputedData) && precomputedData.length > 0) {
      return (precomputedData as LogoPart[]).slice(0, maxPartsCap);
    }
    return [];
  });

  // The reveal needs no parts at all, so a phone never samples the logo image.
  useEffect(() => {
    if (!shouldAnimate || mobileReveal) {
      if (!shouldAnimate && onComplete) onComplete();
      return;
    }

    if (parts.length === 0) {
      sampleLogoImage(logoSrc, density, maxPartsCap).then((res) => {
        setParts(res.parts);
      });
    }
  }, [shouldAnimate, mobileReveal, logoSrc, density, maxPartsCap, onComplete, parts.length]);

  // Nothing watches the reveal frame by frame: this timer only records that the
  // intro has played, so it does not run again this session, and tells a caller
  // when the lockup has settled.
  const mobileSettledRef = useRef(false);
  useEffect(() => {
    if (!mobileReveal) return;
    const id = window.setTimeout(() => {
      if (mobileSettledRef.current) return;
      mobileSettledRef.current = true;
      sessionStorage.setItem('pga_logo_animated', 'true');
      if (onComplete) onComplete();
    }, MOBILE_REVEAL_MS + MOBILE_SETTLE_GRACE_MS);
    return () => clearTimeout(id);
  }, [mobileReveal, onComplete]);

  useEffect(() => {
    if (!shouldAnimate || mobileReveal || parts.length === 0) return;

    const totalDuration = 2.6;
    let cancelled = false;
    let started = false;
    let settled = false;
    let rafId: number | null = null;
    let rafId2: number | null = null;
    let startTimerId: number | null = null;
    let watchdogId: number | null = null;

    /** Land the lockup on its final state exactly once, whether the timeline
     *  reached the end on its own or had to be rescued. */
    const settle = () => {
      if (settled) return;
      settled = true;
      // Release the promoted layer and every inline animation style so the
      // settled lockup renders exactly like the static fallback.
      gsap.set([markRef.current, wrapperRef.current], { clearProps: 'transform,willChange' });
      if (wordmarkRef.current) {
        gsap.set(wordmarkRef.current, { clearProps: 'clipPath' });
        gsap.set(wordmarkRef.current.children, { clearProps: 'transform,opacity' });
      }
      sessionStorage.setItem('pga_logo_animated', 'true');
      if (onComplete) onComplete();
    };

    const timeline = gsap.timeline({
      // Built (and pre-positioned) now, played once fonts + first paint settle.
      paused: true,
      onComplete: settle,
    });

    const stippleNodes = stippleGroupRef.current?.querySelectorAll('circle') || [];
    const circles = Array.from(stippleNodes) as SVGCircleElement[];

    // Hardware acceleration setup. Only the mark is promoted and scaled: it is
    // a single small element, so the compositor can scale one layer instead of
    // re-rasterising the whole lockup (mark plus wordmark) every frame.
    gsap.set(markRef.current, {
      scale: FULL_START_SCALE,
      force3D: true,
      willChange: 'transform',
    });
    gsap.set(realLogoRef.current, { opacity: 0 });

    if (wordmarkRef.current) {
      // Wipe the wordmark as ONE clipped container instead of a clip-path per
      // letter, and drop the per-letter blur filters that forced a full
      // re-rasterisation of every glyph on every frame.
      gsap.set(wordmarkRef.current, { clipPath: 'inset(0% 100% 0% 0%)' });
      // Transform + opacity only: both can composite off the main thread.
      gsap.set(wordmarkRef.current.children, { y: 8, opacity: 0 });
    }

    // Phase A: Scatter-in (0% to 24%, ~625ms)
    // Precompute every dot offset up front so the animation performs no DOM
    // measurements while it runs.
    const dotOffsets = parts.map((part) => {
      const angle = Math.atan2(part.y - 0.5, part.x - 0.5) + (Math.random() - 0.5) * 0.3;
      const dist = (1.2 + Math.random() * 0.6) * 220;
      return {
        startX: (part.x - 0.5) * 220 + Math.cos(angle) * dist,
        startY: (part.y - 0.5) * 220 + Math.sin(angle) * dist,
        x: (part.x - 0.5) * 220,
        y: (part.y - 0.5) * 220,
      };
    });

    // Two batched calls replace the previous 55 gsap.set + 55 timeline.to
    // calls. Each dot is centred on 0,0, so the explicit '0px 0px' origin
    // matches 'center center' without a per-node getBBox() layout read.
    gsap.set(circles, {
      x: (i: number) => dotOffsets[i].startX,
      y: (i: number) => dotOffsets[i].startY,
      scale: 0.2,
      opacity: 0,
      transformOrigin: '0px 0px',
    });

    timeline.to(
      circles,
      {
        x: (i: number) => dotOffsets[i].x,
        y: (i: number) => dotOffsets[i].y,
        scale: 1,
        opacity: 1,
        duration: 0.55,
        ease: 'back.out(1.3)',
        stagger: { amount: 0.22, from: 'random' },
      },
      0
    );

    // Phase B: Gentle Group Breathe (24% to 46%). Phones never reach this
    // timeline: scaling the whole dot group re-rasterises every one of them.
    const phaseBTime = totalDuration * 0.24;
    if (stippleGroupRef.current) {
      timeline.to(
        stippleGroupRef.current,
        {
          scale: 1.03,
          duration: 0.28,
          repeat: 1,
          yoyo: true,
          ease: 'sine.inOut',
          // (0,0) is the logo centre in viewBox space, so no getBBox() read.
          transformOrigin: '0px 0px',
        },
        phaseBTime
      );
    }

    // Phase C: Contract (46% to 58%)
    const phaseCTime = totalDuration * 0.46;
    const phaseCDuration = totalDuration * 0.12;

    timeline.to(
      markRef.current,
      {
        scale: 1,
        duration: phaseCDuration,
        ease: 'power3.inOut',
      },
      phaseCTime
    );

    // Phase C.5: Fast crossfade to real crisp logo
    const crossfadeTime = phaseCTime + phaseCDuration * 0.75;
    timeline.to(
      stippleGroupRef.current,
      {
        opacity: 0,
        duration: 0.08,
        ease: 'linear',
      },
      crossfadeTime
    );

    timeline.to(
      realLogoRef.current,
      {
        opacity: 1,
        duration: 0.08,
        ease: 'linear',
      },
      crossfadeTime
    );

    // Phase D: Wordmark Reveal (50% to 92%)
    if (wordmarkRef.current && wordmarkRef.current.children.length > 0) {
      const phaseDTime = totalDuration * 0.48;
      const letters = Array.from(wordmarkRef.current.children) as HTMLElement[];

      // The wipe runs on the container: one clipped element, one paint region.
      timeline.to(
        wordmarkRef.current,
        {
          clipPath: 'inset(0% 0% 0% 0%)',
          duration: 0.55,
          ease: 'power2.out',
        },
        phaseDTime
      );

      // The letters themselves only move and fade, both off the main thread.
      timeline.to(
        letters,
        {
          y: 0,
          opacity: 1,
          duration: 0.3,
          ease: 'expo.out',
          stagger: 0.025,
        },
        phaseDTime
      );
    }

    // Hold the intro until the web fonts have settled and the load frame has
    // painted, so it never fights the rest of the page for the main thread.
    // If the fonts are already in, this resolves without adding a delay.
    const fontsPending =
      typeof document !== 'undefined' && 'fonts' in document && document.fonts.status !== 'loaded';
    const fontsReady = fontsPending
      ? Promise.race([
          document.fonts.ready.catch(() => undefined),
          new Promise((resolve) => setTimeout(resolve, 500)),
        ])
      : Promise.resolve();

    const begin = () => {
      if (cancelled || started) return;
      started = true;
      timeline.play(0);
      // GSAP renders on requestAnimationFrame. A window that is occluded,
      // backgrounded or embedded can starve that callback indefinitely, which
      // used to leave the mark stranded at its opening scale with the dots
      // scattered and the wordmark clipped away: the logo read as broken rather
      // than merely unanimated. If the playhead has not reached the end by the
      // time it should have, jump straight to the finished lockup.
      watchdogId = window.setTimeout(() => {
        if (cancelled || timeline.progress() >= 1) return;
        timeline.pause();
        timeline.progress(1);
        settle();
      }, totalDuration * 1000 + STALL_GRACE_MS);
    };

    // A tab hidden mid-intro is the same failure by another route, so finish it
    // while nobody is looking instead of returning to a half-drawn logo.
    const onVisibilityChange = () => {
      if (!document.hidden || !started || settled) return;
      timeline.pause();
      timeline.progress(1);
      settle();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    fontsReady.then(() => {
      if (cancelled) return;
      // Prefer a frame boundary, but never depend on rAF alone: occluded or
      // embedded webviews can pause it indefinitely, which would otherwise
      // strand the logo invisible. The timer is the safety net.
      if (typeof requestAnimationFrame === 'function') {
        rafId = requestAnimationFrame(() => {
          rafId2 = requestAnimationFrame(begin);
        });
      }
      startTimerId = window.setTimeout(begin, 120);
    });

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (rafId2 !== null) cancelAnimationFrame(rafId2);
      if (startTimerId !== null) clearTimeout(startTimerId);
      if (watchdogId !== null) clearTimeout(watchdogId);
      timeline.kill();
    };
  }, [shouldAnimate, mobileReveal, parts, onComplete]);

  // Static lockup: used when the visitor has already seen the intro, prefers
  // reduced motion, or the logo parts could not be sampled. Without the last
  // case the header would render nothing at all.
  if (!shouldAnimate || parts.length === 0) {
    return (
      <div className={`inline-flex items-center gap-1.5 md:gap-2 ${className}`}>
        {/* Was: <img src={logoSrc} className="h-8 md:h-10 w-auto object-contain shrink-0" /> */}
        <BrandMark darkSrc={logoSrc} lightSrc={lightLogoSrc} frameClassName={MARK_FRAME_SIZE} />
        {wordmarkText && (
          // Hidden below lg: on mid-size screens the wordmark and the nav links
          // cannot both fit, and it used to wrap onto three lines and sit on top
          // of them. The mark alone carries the brand there.
          <span className="hidden lg:inline whitespace-nowrap font-[family-name:var(--font-heading)] font-bold text-base md:text-lg tracking-tight text-white">
            {wordmarkText}
          </span>
        )}
      </div>
    );
  }

  // Phones: one element, one CSS animation, no dot layer underneath to paint.
  // The reveal stops exactly where the static lockup above sits, so the next
  // render cannot jump, and the wordmark is left out for the same reason that
  // lockup hides it below lg: it would not fit next to the nav anyway.
  if (mobileReveal) {
    return (
      <div className={`inline-flex items-center ${className}`}>
        {/* Was: <img src={logoSrc} className="h-8 md:h-10 w-auto object-contain shrink-0
            animate-logo-reveal motion-reduce:animate-none" /> */}
        <BrandMark
          darkSrc={logoSrc}
          lightSrc={lightLogoSrc}
          frameClassName={MARK_FRAME_SIZE}
          frameExtraClassName="animate-logo-reveal motion-reduce:animate-none"
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center justify-center p-1 ${className}`}
      style={{ overflow: 'visible' }}
    >
      {/* The timeline's opening frame is expressed in CSS here as well (the
          start scale, and the inline opacity on every dot). These values used
          to be applied inside the effect below, which runs after the first
          paint, so the finished lockup flashed for a frame before snapping
          back to the start. Baking them into the markup means the first frame
          painted already is the first frame of the animation. */}
      <div ref={wrapperRef} className="relative flex items-center gap-1.5 md:gap-2">
        {/* Was: className="relative w-9 h-9 md:w-11 md:h-11 ...". The mark box
            now matches the square the static lockup uses, so the intro and the
            everypage logo are the same size. */}
        <div
          ref={markRef}
          className={`relative flex items-center justify-center ${MARK_FRAME_SIZE}`}
          style={{ transform: `scale(${FULL_START_SCALE})`, willChange: 'transform' }}
        >
          {/* Was: style={{ width: '40px', height: '40px' }}. The hardcoded size
              was smaller than the box it sat in, so the dot layer and the
              settled logo did not line up. It follows the box now. */}
          <svg
            className="w-full h-full overflow-visible"
            viewBox="-110 -110 220 220"
            style={{ overflow: 'visible' }}
          >
            <g ref={stippleGroupRef}>
              {parts.map((part, idx) => (
                <circle
                  key={idx}
                  r={part.radius * 220}
                  fill="currentColor"
                  className="text-mint"
                  style={{ opacity: 0 }}
                />
              ))}
            </g>
          </svg>

          {/* Was:
          <img
            ref={realLogoRef}
            src={logoSrc}
            alt="People Growth Africa"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-0"
          />
          `object-contain` letterboxed the wide 683x512 file inside a square
          box, which drew the leaf at about 40% of the box and made the mark
          shrink on the crossfade. The clipped frame below is the same one the
          static lockup uses, so the intro lands on the size it settles at. */}
          <div
            ref={realLogoRef}
            className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none opacity-0"
          >
            <img
              src={logoSrc}
              alt="People Growth Africa"
              className="h-full w-auto max-w-none object-contain"
              style={{ transform: `scale(${MARK_FRAME_SCALE})` }}
            />
          </div>
        </div>

        {wordmarkText && (
          // `inline-flex` (not flex items inside a wrapping line) keeps every
          // letter on one line, so the wordmark can never break into a stack.
          <div
            ref={wordmarkRef}
            className="hidden lg:inline-flex items-center whitespace-nowrap font-[family-name:var(--font-heading)] font-bold text-base md:text-lg tracking-tight text-white"
            style={{ clipPath: 'inset(0% 100% 0% 0%)' }}
          >
            {wordmarkText.split('').map((char, index) => (
              <span
                key={index}
                className="inline-block shrink-0"
                style={{
                  whiteSpace: char === ' ' ? 'pre' : 'normal',
                  opacity: 0,
                  transform: 'translateY(8px)',
                }}
              >
                {char}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default LogoIntroAnimation;
