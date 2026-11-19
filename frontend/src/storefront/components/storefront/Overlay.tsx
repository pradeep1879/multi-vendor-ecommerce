import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

// Native modal dialogs trap keyboard focus and make the background inert.
export function Overlay({
  open,
  onClose,
  title,
  children,
  className = '',
  side = 'right',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  side?: 'left' | 'right' | 'top';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`store-overlay store-overlay--${side} ${className}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            onClose();
        }
      }}
    >
      <div className="store-overlay-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="store-icon"
          onClick={onClose}
          aria-label={`Close ${title.toLowerCase()}`}
        >
          <X size={22} strokeWidth={1.5} />
        </button>
      </div>
      {open && children}
    </dialog>
  );
}
