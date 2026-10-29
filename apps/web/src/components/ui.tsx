'use client';

import { useEffect, useRef, useState, type CSSProperties, type ElementType } from 'react';
import { C, hueOf, priceParts } from '@/lib/format';

/**
 * Token avatar: the token's logo in the prototype's round avatar. If the token has no logo, or the
 * image fails to load, it falls back to the prototype's letter-on-hue avatar so no row is ever blank.
 * `inline` sizes it to sit in a line of text (leaderboard, feed).
 */
export function Tok({
  s,
  logo,
  size,
  inline,
}: {
  s: string;
  logo?: string | null;
  size?: number;
  inline?: boolean;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  const img = useRef<HTMLImageElement>(null);
  const showImg = !!logo && broken !== logo;
  // An image that failed before hydration never fires onError in React, so check once mounted.
  useEffect(() => {
    const el = img.current;
    if (logo && el?.complete && el.naturalWidth === 0) setBroken(logo);
  }, [logo]);
  const style = { '--h': hueOf(s), ...(size ? { '--s': `${size}px` } : {}) } as CSSProperties;
  return (
    <span className={`tok${showImg ? ' img' : ''}${inline ? ' inl' : ''}`} style={style} aria-hidden="true">
      {showImg ? (
        // A plain <img>: these are tiny avatars, and in P1 they come from our own logo proxy.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={img}
          src={logo}
          alt=""
          width={size ?? 28}
          height={size ?? 28}
          decoding="async"
          onError={() => setBroken(logo)}
        />
      ) : (
        s[0]
      )}
    </span>
  );
}

/** Price with the subscript-zero format for anything under $0.001. */
export function Price({ p }: { p: number }) {
  const r = priceParts(p);
  if (r.kind === 'plain') return <>{r.text}</>;
  return (
    <>
      $0.0<sub>{r.zeros}</sub>
      {r.digits}
    </>
  );
}

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A live price that flashes green or red for 0.9 s when it changes, exactly like the prototype's
 * updateRows. Respects prefers-reduced-motion.
 */
export function Px({
  p,
  prev,
  as: Tag = 'span',
  className,
  ...rest
}: {
  p: number;
  prev: number;
  as?: ElementType;
  className?: string;
  role?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || p === prev || reducedMotion()) return;
    el.style.transition = 'none';
    el.style.color = p > prev ? C.long : C.short;
    const id = requestAnimationFrame(() => {
      el.style.transition = 'color .9s';
      el.style.color = '';
    });
    return () => cancelAnimationFrame(id);
  }, [p, prev]);
  return (
    <Tag ref={ref} className={className} {...rest}>
      <Price p={p} />
    </Tag>
  );
}

export function SideChip({ side, lev }: { side: 'long' | 'short'; lev: number }) {
  return (
    <span className={`side ${side === 'long' ? 'l' : 's'}`}>
      {side === 'long' ? 'Long' : 'Short'} {lev}x
    </span>
  );
}

export function Shield({ c = '#A1A1A1', s = 13, style }: { c?: string; s?: number; style?: CSSProperties }) {
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" aria-hidden="true" style={style}>
      <path
        d="M8 1.5l5.5 2.2v4.1c0 3.2-2.3 5.6-5.5 6.7-3.2-1.1-5.5-3.5-5.5-6.7V3.7z"
        fill="none"
        stroke={c}
        strokeWidth="1.4"
      />
    </svg>
  );
}

export const Lock = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="3.5" y="7" width="9" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export const CopyIcon = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="5" y="5" width="9" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M11 3H4a1 1 0 0 0-1 1v7" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export const SearchIcon = ({ s = 14 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="7" cy="7" r="5" fill="none" stroke="#6E6E6E" strokeWidth="1.5" />
    <path d="M11 11l3 3" stroke="#6E6E6E" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const LogoMark = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="10" cy="10" r="8.6" fill="none" stroke="#EDEDED" strokeWidth="1.4" />
    <path d="M10 1.4a8.6 8.6 0 0 1 0 17.2z" fill="#EDEDED" />
  </svg>
);
