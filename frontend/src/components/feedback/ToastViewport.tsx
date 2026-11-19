import { useEffect, useState } from 'react';
import { Check, Info, X, XCircle } from 'lucide-react';
import type { ToastKind } from './toast';

type ToastItem = { id: number; message: string; kind: ToastKind };

export function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; kind?: ToastKind }>).detail;
      if (!detail?.message) return;
      const id = Date.now() + Math.random();
      setItems((current) => [
        ...current.slice(-3),
        { id, message: detail.message!, kind: detail.kind ?? 'info' },
      ]);
      window.setTimeout(
        () => setItems((current) => current.filter((item) => item.id !== id)),
        4800,
      );
    };
    window.addEventListener('app:toast', onToast);
    return () => window.removeEventListener('app:toast', onToast);
  }, []);

  return (
    <div
      className="app-toast-viewport"
      aria-live="polite"
      aria-relevant="additions text"
      aria-label="Notifications"
    >
      {items.map((item) => {
        const Icon = item.kind === 'error' ? XCircle : item.kind === 'success' ? Check : Info;
        return (
          <div
            className={`app-toast app-toast-${item.kind}`}
            role={item.kind === 'error' ? 'alert' : 'status'}
            key={item.id}
          >
            <span className="app-toast-icon">
              <Icon size={18} aria-hidden="true" />
            </span>
            <p>{item.message}</p>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setItems((current) => current.filter((toast) => toast.id !== item.id))}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
