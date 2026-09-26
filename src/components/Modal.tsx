import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  closable?: boolean;
  initialFocus?: 'first-control' | 'dialog';
}

export default function Modal({ title, children, onClose, className = '', closable = true, initialFocus = 'first-control' }: Props) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (initialFocus === 'dialog') dialog.current?.focus({ preventScroll: true });
    else dialog.current?.querySelector<HTMLElement>('button, input, select, textarea, [tabindex="0"]')?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape' && closable) closeRef.current();
      if (event.key !== 'Tab' || !dialog.current) return;
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]')];
      if (!focusable.length) return;
      if (document.activeElement === dialog.current) {
        event.preventDefault();
        (event.shiftKey ? focusable.at(-1) : focusable[0])?.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
    }
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, [closable, initialFocus]);

  return <div className="modal-backdrop" onMouseDown={event => { if (closable && event.target === event.currentTarget) onClose(); }}>
    <div className={`modal-card ${className}`} ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <div className="modal-header"><h2 id={titleId}>{title}</h2>{closable && <button className="icon-button" aria-label="关闭" onClick={onClose}><X size={20} /></button>}</div>
      <div className="modal-body">{children}</div>
    </div>
  </div>;
}
