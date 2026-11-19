import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { StoreShell } from '../../components/storefront/StoreShell';

export function AuthLayout({
  title,
  eyebrow = 'A GOOD PLACE TO BEGIN',
  description,
  children,
}: {
  title: ReactNode;
  eyebrow?: string;
  description?: string;
  children: ReactNode;
}) {
  const location = useLocation();
  if (location.pathname.startsWith('/admin'))
    return (
      <main className="account-page auth-page">
        <Link to="/" className="auth-wordmark">
          maison <i>beauté</i>
        </Link>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
        {children}
      </main>
    );
  return (
    <StoreShell>
      <section className="store-auth">
        <h1>{title}</h1>
        {description && <p className="store-auth-description">{description}</p>}
        {children}
      </section>
    </StoreShell>
  );
}
