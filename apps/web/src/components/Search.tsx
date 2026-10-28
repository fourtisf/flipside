'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { pct } from '@/lib/format';
import { chg1h, hot, type Coin } from '@/mock/sim';
import { useSim } from '@/mock/provider';
import { Price, SearchIcon, Tok } from './ui';

const CA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const caMsg = (v: string) =>
  CA_RE.test(v.trim())
    ? "That address isn't tradable yet. Coins open once they reach a $30K market cap, 100 holders and 7 SOL in trading fees."
    : 'No coin matches that. Paste a full contract address (32 to 44 characters) or a ticker like $GLOOP.';

function matches(coins: Coin[], v: string): string[] {
  const q = v.trim().replace(/^\$/, '').toLowerCase();
  if (!q)
    return coins
      .filter((c) => c.status === 'open')
      .sort((a, b) => hot(b) - hot(a))
      .slice(0, 5)
      .map((c) => c.sym);
  return coins
    .filter(
      (c) =>
        c.sym.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.mint.toLowerCase() === q,
    )
    .slice(0, 6)
    .map((c) => c.sym);
}

/**
 * The prototype's attachSearch(): a combobox that suggests "Moving now" coins when empty, matches
 * tickers, names and full contract addresses, and supports arrow keys, Enter and Escape.
 */
export function SearchBox({
  id,
  placeholder,
  label,
  onPick,
  className,
  before,
  after,
}: {
  id: 'q1' | 'q2';
  placeholder: string;
  label: string;
  onPick: (c: Coin) => void;
  className: string;
  before?: ReactNode;
  after?: ReactNode;
}) {
  const sim = useSim();
  const ddId = id === 'q1' ? 'dd1' : 'dd2';
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  // The option list is frozen between renders of the dropdown, like the prototype's innerHTML.
  const [items, setItems] = useState<string[]>([]);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const render = (v: string, i = idx) => {
    const next = matches(sim.coins, v);
    setItems(next);
    setIdx(i >= next.length ? 0 : i);
    setOpen(true);
  };
  const close = () => setOpen(false);
  const choose = (c: Coin) => {
    setValue('');
    close();
    input.current?.blur();
    onPick(c);
  };
  const pick = () => {
    const v = value.trim();
    const c = sim.bySym[v.replace(/^\$/, '').toUpperCase()] ?? sim.byMint[v] ?? sim.bySym[items[idx] ?? ''];
    if (!c || !items.length) return render(value);
    choose(c);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [open]);

  const optId = (i: number) => `${ddId}-o${i}`;
  return (
    <div className={className} ref={wrap}>
      {before ?? <SearchIcon />}
      <label htmlFor={id} className="vh">
        {label}
      </label>
      <input
        ref={input}
        id={id}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        aria-controls={ddId}
        aria-autocomplete="list"
        aria-activedescendant={open && items.length ? optId(idx) : undefined}
        value={value}
        onFocus={() => render(value)}
        onChange={(e) => {
          setValue(e.target.value);
          render(e.target.value, 0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!items.length) return;
            setIdx((idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
            setOpen(true);
          } else if (e.key === 'Escape') {
            close();
            input.current?.blur();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            pick();
          }
        }}
      />
      {after}
      <div className="dd" id={ddId} role="listbox" aria-label={label} hidden={!open}>
        {open &&
          (!items.length ? (
            <div className="dd-msg" role="presentation">
              {caMsg(value)}
            </div>
          ) : (
            <>
              {!value.trim() && (
                <div className="dd-h" role="presentation">
                  Moving now
                </div>
              )}
              {items.map((sym, i) => {
                const c = sim.bySym[sym]!;
                const ch = chg1h(c);
                return (
                  <button
                    type="button"
                    key={sym}
                    id={optId(i)}
                    className="dd-i"
                    role="option"
                    aria-selected={i === idx}
                    tabIndex={-1}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(c);
                    }}
                  >
                    <Tok s={c.sym} size={26} />
                    <span>
                      <b>${c.sym}</b>
                      <small>
                        {c.name}, {c.venue}
                      </small>
                    </span>
                    <span className="r n">
                      <Price p={c.price} />
                      <br />
                      <small className={ch >= 0 ? 'up' : 'dn'}>{pct(ch)}</small>
                    </span>
                  </button>
                );
              })}
            </>
          ))}
      </div>
    </div>
  );
}
