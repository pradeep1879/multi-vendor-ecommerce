import type { ReactNode } from 'react';
import { PackageOpen } from 'lucide-react';

export function StoreStatus({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="store-status" role="status">
      <PackageOpen size={32} strokeWidth={1.25} aria-hidden="true" />
      <h2>{title}</h2>
      {children && <div className="store-status-copy">{children}</div>}
      {action && <div className="store-status-action">{action}</div>}
    </div>
  );
}

export function StoreSkeleton({
  variant = 'page',
  count = 4,
}: {
  variant?: 'products' | 'page' | 'lines';
  count?: number;
}) {
  return (
    <div
      className={`store-skeleton store-skeleton--${variant}`}
      role="status"
      aria-label="Loading content"
    >
      <span className="sr-only">Loading content</span>
      {Array.from({ length: count }, (_, index) => (
        <div className="store-skeleton-item" key={index} aria-hidden="true">
          <div className="skeleton-media" />
          <div className="skeleton-copy">
            <span />
            <span />
            <span />
          </div>
        </div>
      ))}
    </div>
  );
}
