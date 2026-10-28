'use client';

import { useEffect, useRef, type CSSProperties, type ElementType } from 'react';
import { C, hueOf, priceParts } from '@/lib/format';

/** Token avatar: first letter on a hue derived from the ticker. */
export function Tok({ s, size }: { s: string; size?: number }) {
  const style = { '--h': hueOf(s), ...(size ? { '--s': `${size}px` } : {}) } as CSSProperties;
  return (
    <span className="tok" style={style} aria-hidden="true">
      {s[0]}
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
