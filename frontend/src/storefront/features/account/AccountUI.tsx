import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShoppingBag } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { readable, statusTone } from './account-utils';

export function State({
  loading,
  error,
  retry,
  children,
}: {
  loading: boolean;
  error: boolean;
  retry: () => void;
  children: ReactNode;
}) {
  if (loading)
    return (
      <div className="space-y-3" aria-label="Loading">
        <div className="h-24 animate-pulse bg-white" />
        <div className="h-36 animate-pulse bg-white" />
      </div>
    );
  if (error)
    return (
      <div className="flex justify-center py-5">
        <Button variant="outline" onClick={retry} aria-label="Retry loading this section">
          Retry
        </Button>
      </div>
    );
  return <>{children}</>;
}

export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm font-semibold tracking-[.04em] text-store-muted">{eyebrow}</p>
        <h2 className="mt-2 font-store text-3xl font-normal tracking-tight sm:text-3xl">{title}</h2>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-store-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Empty({
  title,
  description,
  to = '/',
  action = 'Explore the collection',
}: {
  title: string;
  description: string;
  to?: string;
  action?: string;
}) {
  return (
    <div className="border border-dashed border-store-line bg-white/70 px-5 py-12 text-center">
      <p className="font-store text-2xl">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-store-muted">{description}</p>
      <Link
        className="mt-5 inline-flex items-center gap-2 text-sm underline underline-offset-4"
        to={to}
      >
        {action}
        <ArrowRight size={13} />
      </Link>
    </div>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`border border-store-line bg-white p-5 sm:p-6 ${className}`}>
      {children}
    </section>
  );
}

export function Badge({ value }: { value: string }) {
  return (
    <span className={`inline-flex px-2.5 py-1 text-sm ${statusTone(value)}`}>
      {readable(value)}
    </span>
  );
}

export function Pager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  return pages > 1 ? (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span>
        Page {page} of {pages}
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  ) : null;
}

export function ProductThumb({
  src,
  alt,
  className = 'h-14 w-12',
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  return src ? (
    <img src={src} alt={alt} className={`${className} shrink-0 bg-store-soft object-cover`} />
  ) : (
    <div
      aria-label={alt}
      className={`grid ${className} shrink-0 place-items-center bg-store-soft text-store-muted`}
    >
      <ShoppingBag size={16} />
    </div>
  );
}
