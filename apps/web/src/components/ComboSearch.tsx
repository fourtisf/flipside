'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SearchIcon } from './ui';

/**
 * The prototype's attachSearch(), for any list: a combobox that suggests a few items when empty, filters as
 * you type, and supports arrow keys, Enter and Escape. The prototype's coin search (Search.tsx) and the
 * Hyperliquid market search (live/LiveSearch.tsx) both use it.
 */
export function ComboSearch<K extends string>({
  id,
  placeholder,
  label,
  className,
  before,
  after,
  heading,
  matches,
  resolve,
  emptyMsg,
  renderItem,
  onPick,
}: {
  id: 'q1' | 'q2';
  placeholder: string;
  label: string;
  className: string;
  before?: ReactNode;
  after?: ReactNode;
  /** Shown above the suggestions while the box is empty, e.g. "Moving now". */
  heading: string;
  /** Item keys for the typed text; the suggestions when it is empty. */
  matches: (v: string) => K[];
  /** The item the typed text names exactly, if any (Enter picks it even if it isn't highlighted). */
  resolve: (v: string) => K | undefined;
  /** What to say when nothing matches. */
  emptyMsg: (v: string) => string;
  /** The inside of one option. */
  renderItem: (k: K) => ReactNode;
  onPick: (k: K) => void;
}) {
  const ddId = id === 'q1' ? 'dd1' : 'dd2';
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  // The option list is frozen between renders of the dropdown, like the prototype's innerHTML.
  const [items, setItems] = useState<K[]>([]);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const render = (v: string, i = idx) => {
    const next = matches(v);
    setItems(next);
    setIdx(i >= next.length ? 0 : i);
    setOpen(true);
  };
  const close = () => setOpen(false);
  const choose = (k: K) => {
    setValue('');
    close();
    input.current?.blur();
    onPick(k);
  };
  const pick = () => {
    const k = resolve(value.trim()) ?? items[idx];
    if (!k || !items.length) return render(value);
    choose(k);
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
              {emptyMsg(value)}
            </div>
          ) : (
            <>
              {!value.trim() && (
                <div className="dd-h" role="presentation">
                  {heading}
                </div>
              )}
              {items.map((k, i) => (
                <button
                  type="button"
                  key={k}
                  id={optId(i)}
                  className="dd-i"
                  role="option"
                  aria-selected={i === idx}
                  tabIndex={-1}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(k);
                  }}
                >
                  {renderItem(k)}
                </button>
              ))}
            </>
          ))}
      </div>
    </div>
  );
}
