import { useState } from 'react';

type ContentImageProps = {
  src: string | null;
  alt: string;
  className?: string;
  /** The image above the fold on a detail page; everything else can wait. */
  eager?: boolean;
};

/**
 * A sheet image, with a branded placeholder instead of a broken picture.
 *
 * Sheet images are pasted links, so there are three ways one can fail: the cell
 * was blank, the host was not on the allowlist (the server turns those into
 * null), or the link looked valid and the file has since been deleted or made
 * private. The first two are decided before render; the third arrives as an
 * `error` event, which switches to the same placeholder. Nothing here can render
 * an external URL the server did not already approve, because a null src never
 * becomes an `<img>`.
 */
export default function ContentImage({ src, alt, className = '', eager = false }: ContentImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`relative flex items-center justify-center overflow-hidden bg-deep-green ${className}`}
        aria-hidden="true"
      >
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-brand-green/40" />
        <div className="absolute -bottom-8 -left-8 h-28 w-28 rounded-full bg-terracotta/25" />
        <img
          src="/images/icon-white.png"
          alt=""
          className="relative h-9 w-auto opacity-70"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`object-cover ${className}`}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
