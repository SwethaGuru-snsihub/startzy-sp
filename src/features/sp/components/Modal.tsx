'use client';
import { useEffect, useRef } from 'react';

/** A popup over the office. `locked` popups are the founder's required next step: no outside click, no Escape. */
export default function Modal({ children, onClose, locked = false, label }: { children: React.ReactNode; onClose?: () => void; locked?: boolean; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
    if (locked || !onClose) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [locked, onClose]);
  return (
    <div className="sp-overlay" onMouseDown={e => { if (!locked && onClose && e.target === e.currentTarget) onClose(); }}>
      <div ref={box} className="sp-modal" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{children}</div>
    </div>
  );
}
