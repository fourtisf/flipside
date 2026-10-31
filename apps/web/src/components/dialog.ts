'use client';

import { useEffect, useRef } from 'react';

/** Open/close a native <dialog> from state, and report its returnValue on close. */
export function useDialog(open: boolean, onClose: (value: string) => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const handler = () => cb.current(d.returnValue);
    d.addEventListener('close', handler);
    return () => d.removeEventListener('close', handler);
  }, []);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.returnValue = '';
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);
  return ref;
}
