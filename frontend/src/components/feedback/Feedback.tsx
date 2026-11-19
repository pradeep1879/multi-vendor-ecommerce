import { useEffect, type ReactNode } from 'react';
import { showToast } from './toast';

export function LoadingState({ children = 'Loading…' }: { children?: ReactNode }) {
  return (
    <p className="muted" role="status" aria-live="polite">
      {children}
    </p>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {description && <p className="muted">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  useEffect(() => {
    showToast(message, 'error');
  }, [message]);
  return (
    <div className="message error-actions">
      {onRetry && (
        <button className="button subtle" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
